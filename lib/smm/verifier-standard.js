import ABRStringStore from './abr-string-store';
import './scoper';
import { MMOMError, MMOMErrorLocation, MMOMDatabase, MMOMStatement } from './mmom';

MMOMError.register('verify', 'no-such-assertion', 'Cannot find referenced assertion or hypothesis');
MMOMError.register('verify', 'inactive-hyp', 'Hypothesis referenced in proof must be active for the proof');
MMOMError.register('verify', 'not-yet-proved', 'Assertion referenced in proof must be textually before the proof');
MMOMError.register('verify', 'recall-out-of-range', 'Compressed proof is trying to recall a step which has not yet been saved'); //MOREDATA
MMOMError.register('verify', 'stack-underflow', 'This step has more mandatory hypotheses than the current stack depth'); //MOREDATA
MMOMError.register('verify', 'type-mismatch', 'Mandatory hypothesis type differs from type on stack'); //MOREDATA
MMOMError.register('verify', 'math-mismatch', 'Stacked proof must equal math string for mandatory $e hypothesis'); //MOREDATA
MMOMError.register('verify', 'dv-violation', 'Disjoint variable condition is not satisfied'); //MOREDATA
MMOMError.register('verify', 'compression-nonterm', ') token missing in compressed proof');
MMOMError.register('verify', 'compression-dummy-in-roster', '? may not be used in compressed proof header');
MMOMError.register('verify', 'compression-redundant-roster', 'Compressed proof header may not repeat statements or statements that are already mandatory hypotheses');
MMOMError.register('verify', 'compressed-cant-save-here', 'In compressed proof, Z may only appear immediately after a compressed step'); //MOREDATA
MMOMError.register('verify', 'bad-compressed-char', 'In compressed proof, only ? and capital letters are permitted'); //MOREDATA
MMOMError.register('verify', 'compressed-partial-integer', 'Compressed proof ends with partial step');
MMOMError.register('verify', 'done-bad-stack-depth', 'Proof must end with exactly one value on stack'); //MOREDATA
MMOMError.register('verify', 'done-bad-type', 'Type of final result of proof must be same as assertion'); //MOREDATA
MMOMError.register('verify', 'done-bad-math', 'Math string of final result of proof must be same as assertion'); //MOREDATA
MMOMError.register('verify', 'done-incomplete', 'Proof contains ? placeholder', { warning: true });

var hists={};
function sample(name,val) {
    if (!hists[name]) {
        hists[name] = new Map();
        process.nextTick(function () {
            console.log(name, hists[name]);
            delete hists[name];
        });
    }
    hists[name].set(val, 1 + (hists[name].get(val) || 0));
}

class MMVerifyStandard {
    constructor(db) {
        this.db = db;
        this.db._observer.push(this);
        this.scoper = db.scoper;
        this.aframes = new Map();

        this._checkedAll = false;
        this._checked = new Set();
        this._errorMap = new Map();
    }

    notifyChanged(record) {
        this.aframes = new Map();
        this._checkedAll = false;
        this._checked = new Set();
        this._errorMap = new Map();
    }

    // TODO: use "data" more systematically so that e.g. the math strings are displayed on unification and dv failure
    _proofError(seg, i, code, data) {
        if (i < 0) return MMOMErrorLocation.statement(seg).error('verify', code, data);
        return MMOMErrorLocation.proof(seg,i).error('verify', code, data);
    }

    _verify(segix) {
        this.scoper._update(); // since we're bypassing the API for speed here
        try {
            return (new MMVerifyState(this, segix, false)).checkProof();
        } catch (e) {
            //sample('abr',1);
            if (e === FAST_BAILOUT) {
                return (new MMVerifyState(this, segix, true)).checkProof();
            }
            else {
                throw e;
            }
        }
    }

    errors(stmt) {
        if (!(stmt instanceof MMOMStatement) || stmt.database !== this.db) throw new TypeError('bad statement to verify');
        if (stmt.type !== MMOMStatement.PROVABLE) return [];
        if (this._checked.has(stmt.index)) {
            return this._errorMap.get(stmt) || [];
        }
        else {
            var err = this._verify(stmt.index);
            this._checked.add(stmt.index);
            if (err.length) this._errorMap.set(stmt,err);
            return err;
        }
    }

    get allErrors() {
        if (!this._checkedAll) {
            for (var i = 0; i < this.db.statements.length; i++) {
                var s = this.db.statements[i];
                if (s.type === MMOMStatement.PROVABLE && !this._checked.has(i)) {
                    var err = this._verify(i);
                    this._checked.add(i);
                    if (err.length) this._errorMap.set(s,err);
                }
            }
            this._checkedAll = true;
        }
        return this._errorMap;
    }
}

function __array(set) { var a=[]; set.forEach(function(v) { a.push(v); }); return a; } // Array.of

function mungeErrors(pos, list) {
    return list.map(function (e) { return pos.error(e.category, e.code, e.data); });
}

var FAST_BAILOUT = new Error();

class MMVerifyState {
    constructor(verify, segix, use_abr) {
        this.scoper = verify.scoper;
        this.verify = verify;
        this.statements = verify.db.statements;
        this.seg = this.statements[segix];
        this.var2flag = new Map();
        this.use_bitfield_dv = true;
        this.flag2var = [];
        this.segix = segix;
        this.errors = [];
        this.aframes = verify.aframes;
        this.frame = verify.aframes.get(segix);
        this.checked = new Set();
        this.mathStack = [];
        this.mathSave = [];
        this.varStack = [];
        this.varSave = [];
        this.typeStack = [];
        this.typeSave = [];
        this.depth = 0;
        this.incomplete = false;
        this.varSyms = this.scoper.varSyms;
        this.use_abr = use_abr;
        this.abr = use_abr ? new ABRStringStore() : null;

        if (!this.frame) {
            this.frame = this.scoper.getFrame(segix); 
            this.aframes.set(verify.db.statements[segix].label, this.frame);
            this.aframes.set(segix, this.frame);
        }

        Object.seal(this);
    }

    stepPos(step) {
        if (this.seg.proof[0] === '(') {
            return MMOMErrorLocation.statement(this.seg); // pointing at individual steps of a compressed proof is not all that useful
        }
        else {
            return MMOMErrorLocation.proof(this.seg, i);
        }
    }

    check(i, label) {
        var sym, oframe = this.aframes.get(label), i, v;

        if (!oframe) {
            sym = this.scoper.lookup(label);

            if (!sym || !sym.labelled) {
                this.errors = [this._proofError(i,'no-such-assertion')];
                return null;
            }

            oframe = this.scoper.getFrame(sym.labelled.index);
            this.aframes.set(label, oframe);
        }

        if (oframe.errors.length) {
            this.errors = mungeErrors(this.stepPos(i), oframe.errors);
            return null;
        }

        if (!oframe.hasFrame) {
            if (oframe.ix >= this.segix || this.scoper.ends_ary[oframe.ix] < this.segix) {
                this.errors = [this._proofError(i,'inactive-hyp')];
                return null;
            }

            // only explicitly referenced $e/$f hyps can contribute to the variable universe in this proof
            for (i = 0; i < oframe.mandVars.length; i++) {
                v = oframe.mandVars[i];
                if (!this.use_bitfield_dv || this.var2flag.has(v)) break;
                if (this.flag2var.length === 32) {
                    this.use_bitfield_dv = false;
                }

                this.flag2var.push(v);
                this.var2flag.set(v, 1 << this.var2flag.size);
            }
        }
        else {
            if (oframe.ix >= this.segix) {
                this.errors = [this._proofError(i,'not-yet-proved')];
                return null;
            }
        }
        this.checked.add(label);
        return oframe;
    }

    save() {
        this.mathSave.push(this.mathStack[this.depth-1]);
        this.varSave.push(this.varStack[this.depth-1]);
        this.typeSave.push(this.typeStack[this.depth-1]);
    }

    recall(i) {
        if (i >= this.mathSave.length)
            return this.errors = [this._proofError(-1,'recall-out-of-range')];
        //console.log(`before recall ${i}:`,typeStack.slice(0,depth).map(function (t,ix) { return `[${t}@${__array(varStack[ix]).join('+')}@ ${abr.toArray(mathStack[ix],null,20).join(' ')}]`; }).join(' '));
        this.mathStack[this.depth] = this.mathSave[i];
        this.varStack[this.depth] = this.varSave[i];
        this.typeStack[this.depth] = this.typeSave[i];
        this.depth++;
    }

    getVars(math) {
        if (this.use_bitfield_dv) {
            var out = 0, k;
            for (var k = 0; k < math.length; k++) {
                out |= (this.var2flag.get(math[k]) || 0);
            }
            return out;
        }
        else {
            return new Set(math.filter(function (m) { return this.varSyms.has(m); }, this));
        }
    }

    substify(subst, vmap, math, math_s) {
        var out, k;
        if (this.use_abr) {
            out = this.abr.emptyString;
            for (k = 0; k < math.length; k++) {
                if (vmap.has(math[k])) {
                    out = this.abr.concat(out, subst[vmap.get(math[k])]);
                }
                else {
                    out = this.abr.concat(out, this.abr.singleton(math[k]));
                }
            }
            return out;
        }
        else {
            out = math_s[0];
            for (k = 1; k < math_s.length; k += 2) {
                out = out + subst[math_s[k]];
                out = out + math_s[k+1];
                if (out.length > 1000000) throw FAST_BAILOUT;
            }
            return out;
        }
    }

    // note that, while set.mm has 400 vars, the _vast_ majority of proofs use fewer than 32 of them, so an opportunistic bitfield version would probably be a huge win
    substifyVars(substVars, math) {
        var out,done,k;
        if (this.use_bitfield_dv) {
            out = 0;
            for (k = 0; k < math.length; k++) {
                out |= substVars[math[k]];
            }
        }
        else {
            out = new Set();
            for (k = 0; k < math.length; k++) {
                substVars[math[k]].forEach(function (mm) { out.add(mm); });
            }
        }
        return out;
    }

    step(i, oframe) {
        var oframe, j, mand, subst, substVars;

        //console.log(`before step ${i} (${label}):`,typeStack.slice(0,this.depth).map(function (t,ix) { return `[${t}@${__array(varStack[ix]).join('+')}@ ${abr.toArray(mathStack[ix],null,20).join(' ')}]`; }).join(' '));
        if (!oframe) {
            this.typeStack[this.depth] = this.varStack[this.depth] = this.mathStack[this.depth] = null;
            this.depth++;
            this.incomplete = true;
            return;
        }

        if (!oframe.hasFrame) {
            //sample('ef/ap',0);
            this.typeStack[this.depth] = oframe.ttype;
            this.mathStack[this.depth] = this.use_abr ? this.abr.fromArray(oframe.target) : oframe.target_s[0];
            this.varStack[this.depth] = this.getVars(oframe.target); //Extract variables from this
            this.depth++;
        }
        else {
            //sample('ef/ap',1);
            if (oframe.mand.length > this.depth)
                return this.errors = [this._proofError(i,'stack-underflow')];

            this.depth -= oframe.mand.length;
            //sample('arg',oframe.mand.length);
            //sample('avar',oframe.mandVars.length);
            //sample('adv',oframe.mandDv.length/2);

            subst = [];
            substVars = [];
            // build a subsitution using the $f statements
            for (j = 0; j < oframe.mand.length; j++) {
                mand = oframe.mand[j];
                if (mand.float) {
                    // missing subst info, can't make much progress
                    if (!this.typeStack[this.depth + j]) {
                        this.typeStack[this.depth] = this.mathStack[this.depth] = this.varStack[this.depth] = null;
                        this.depth++;
                        return;
                    }

                    if (mand.type !== this.typeStack[this.depth + j]) {
                        return this.errors = [this._proofError(i,'type-mismatch')];
                    }

                    subst[mand.ix] = this.mathStack[this.depth + j];
                    substVars[mand.ix] = this.varStack[this.depth + j];
                }
            }

            // check logical hyps, if provided
            for (j = 0; j < oframe.mand.length; j++) {
                mand = oframe.mand[j];
                if (!mand.float && this.typeStack[this.depth + j]) {
                    if (mand.type !== this.typeStack[this.depth + j]) {
                        return this.errors = [this._proofError(i,'type-mismatch')];
                    }
                    if (this.substify(subst, oframe.mandVarsMap, mand.goal, mand.goal_s) !== this.mathStack[this.depth + j]) {
                        return this.errors = [this._proofError(i,'math-mismatch')];
                    }
                }
            }

            // check DVs
            if (this.use_bitfield_dv) {
                var dvm1, dvm2, dvi1, dvi2, dvs1;
                for (j = 0; j < oframe.mandDv.length; j += 2) {
                    dvm1 = substVars[oframe.mandDv[j]];
                    for (dvi1 = 0; dvi1 < 32; dvi1++) {
                        if (!(dvm1 & (1 << dvi1))) continue;
                        dvs1 = this.frame.dv.get(this.flag2var[dvi1]);
                        dvm2 = substVars[oframe.mandDv[j+1]];
                        for (dvi2 = 0; dvi2 < 32; dvi2++) {
                            if (!(dvm2 & (1 << dvi2))) continue;
                            if (!dvs1 || !dvs1.has(this.flag2var[dvi2])) {
                                this.errors.push(this._proofError(i, 'dv-violation'));
                            }
                        }
                    }
                }
            }
            else {
                for (j = 0; j < oframe.mandDv.length; j += 2) {
                    substVars[oframe.mandDv[j]].forEach(function (v1) {
                        var dv1 = this.frame.dv.get(v1);
                        substVars[oframe.mandDv[j+1]].forEach(function (v2) {
                            if (!dv1 || !dv1.has(v2)) {
                                this.errors.push(this._proofError(i, 'dv-violation'));
                            }
                        }, this);
                    }, this);
                }
            }
            if (this.errors.length) return this.errors;

            this.typeStack[this.depth] = oframe.ttype;
            this.mathStack[this.depth] = this.substify(subst, oframe.mandVarsMap, oframe.target, oframe.target_s);
            this.varStack[this.depth] = this.substifyVars(substVars, oframe.target_v);
            this.depth++;
        }
    }

    _proofError(i, code) {
        return this.verify._proofError(this.seg, i, code);
    }

    checkProof() {
        var proof = this.seg.proof;
        if (this.seg.type !== MMOMStatement.PROVABLE) throw new Error('verify called on not-$p');

        var frame = this.frame;
        if (frame.errors.length) return mungeErrors(MMOMErrorLocation.statement(this.seg), frame.errors);
        //sample('hyp',frame.mand.length);

        // the proof syntax is not self-synchronizing, so for the most part it doesn't make sense to continue
        if (proof.length && proof[0] === '(') {

            var i = 0, k = 0, j, ch, preload=[], chunk, can_save=false, ref;
            for (i = 0; i < frame.mand.length; i++) {
                ref = this.check(-1, this.statements[frame.mand[i].stmt].label);
                if (!ref) return this.errors;
                preload.push(ref);
            }

            for (i = 1; ; i++) {
                if (i >= proof.length) return [this._proofError(-1,'compression-nonterm')];
                if (proof[i] === ')') break;
                if (proof[i] === '?') return [this._proofError(i,'compression-dummy-in-roster')];
                if (this.checked.has(proof[i])) return [this._proofError(i,'compression-redundant-roster')];
                if (!(ref = this.check(i, proof[i]))) return this.errors;
                preload.push(ref);
            }
            //sample('ovar',this.flag2var.length);

            i++;
            for (; i < proof.length; i++) {
                chunk = proof[i];
                for (j = 0; j < chunk.length; j++) {
                    ch = chunk.charCodeAt(j);
                    if (ch >= 65 && ch <= 84) {
                        k = (k * 20) + (ch - 0x41);
                        if (k >= preload.length) {
                            if (this.recall(k - preload.length)) return this.errors;
                        }
                        else {
                            if (this.step(-1,preload[k])) return this.errors;
                        }
                        can_save = true;
                        k = 0;
                    }
                    else if (ch >= 85 && ch <= 89) {
                        k = (k * 5) + (ch - 84);
                    }
                    else if (ch === 90) {
                        if (!can_save) return [this._proofError(-1,'compressed-cant-save-here')];
                        this.save();
                        can_save = false;
                    }
                    else if (ch === 63) {
                        this.step(-1,null);
                        can_save = false;
                    }
                    else {
                        return [this._proofError(-1,'bad-compressed-char')];
                    }
                }
            }
            if (k) return [this._proofError(-1,'compressed-partial-integer')];
        }
        else {
            var steps_frames = [];
            for (i = 0; i < proof.length; i++) {
                if (proof[i] === '?') {
                    steps_frames.push(null);
                }
                else {
                    if (!(ref = this.check(i, proof[i]))) return this.errors;
                    steps_frames.push(ref);
                }
            }
            //sample('ovar',this.flag2var.length);
            for (i = 0; i < steps_frames.length; i++) {
                if (this.step(i, steps_frames[i])) return this.errors;
            }
        }

        if (this.depth !== 1) {
            return [this._proofError(-1,'done-bad-stack-depth')];
        }

        if (this.typeStack[0]) {
            if (!this.seg.math.length || this.typeStack[0] !== this.seg.math[0]) {
                return [this._proofError(-1,'done-bad-type')];
            }

            if (this.mathStack[0] !== (this.use_abr ? this.abr.fromArray(this.seg.math.slice(1)) : this.seg.math.slice(1).map(function (x) { return x + ' '; }).join(''))) {
                return [this._proofError(-1,'done-bad-math')];
            }
        }

        if (this.incomplete) {
            return [this._proofError(-1,'done-incomplete')]; // put this at the end so we can recognize "the proof is fine, so far as it exists"
        }

        return [];
    }
}

MMOMDatabase.registerAnalyzer('verifier', MMVerifyStandard);
