var mmom = require('../src/MMOM.js');
var db;
function src(x) { beforeAll(function () { db = mmom.Scanner.parseSync('afile',x); }); }
function deep(x) { console.log(require('util').inspect(x,{depth:null,colors:true})); }
function err(db,i) { var e = db.scanErrors[i]; return e ? [ e.source.name, e.offset, e.category, e.code ] : []; }
function seg(db,i) { var e = db.segments[i]; return e ? [ e.type, e.raw, e.math, e.proof ] : []; }
function seg2(db,i) { var e = db.segments[i]; return e ? [ e.type, e.raw, e.math, e.proof, e.label ] : []; }
function pos(db,i,s) { return db.segments[i][s].map(function (v,ix) { return ix%2 ? v : v.name; }); }
function errs(es) {
    it(`has ${es.length} errors`, function () { expect(db.scanErrors.length).toBe(es.length); });
    es.forEach(function (e,ix) {
        it(`error ${ix}: ${e[3]}`, function () { expect(err(db,ix)).toEqual(e); });
    });
}

describe('scan empty database:', function () {
    src('')
    it('is a mmom.Database', function () { expect(db instanceof mmom.Database).toBe(true); });
    it('has no segments', function () { expect(db.segments.length).toBe(0); });
    errs([]);
});

describe('scan whitespace:', function () {
    src(' \t')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is EOF segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.EOF); });
    it('containing source', function () { expect(db.segments[0].raw).toBe(' \t'); });
    errs([]);
});

describe('scan ${ token:', function () {
    src('${')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is OPEN segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.OPEN); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('${'); });
    errs([]);
});

describe('scan ${ token with leading whitespace:', function () {
    src('\n\n${')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is OPEN segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.OPEN); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('\n\n${'); });
    it('has correct token position', function () { expect(db.segments[0].startPos[1]).toBe(2); });
    errs([]);
});

describe('scan ${ token with trailing whitespace:', function () {
    src('${\n\n')
    it('has two segments', function () { expect(db.segments.length).toBe(2); });
    it('is OPEN segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.OPEN); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('${'); });
    it('has correct token position', function () { expect(db.segments[0].startPos[1]).toBe(0); });
    it('is EOF segment', function () { expect(db.segments[1].type).toBe(mmom.Segment.EOF); });
    it('containing source', function () { expect(db.segments[1].raw).toBe('\n\n'); });
    errs([]);
});

describe('scan $} token:', function () {
    src('$}')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is CLOSE segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.CLOSE); });
    errs([]);
});

describe('scan $c statement:', function () {
    src('$c a  b $.')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is CONST segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.CONST); });
    it('has math string', function () { expect(db.segments[0].math).toEqual(['a','b']); });
    it('has math positions (length)', function () { expect(db.segments[0].mathPos.length).toBe(4); });
    it('has math positions (1)', function () { expect(db.segments[0].mathPos[1]).toBe(3); });
    it('has math positions (2)', function () { expect(db.segments[0].mathPos[3]).toBe(6); });
    errs([]);
});

describe('scan $c statement with embedded comment:', function () {
    src('$c a $( x y z $) b $.')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is CONST segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.CONST); });
    it('has math string', function () { expect(db.segments[0].math).toEqual(['a','b']); });
    it('has math positions (length)', function () { expect(db.segments[0].mathPos.length).toBe(4); });
    it('has math positions (1)', function () { expect(db.segments[0].mathPos[1]).toBe(3); });
    it('has math positions (2)', function () { expect(db.segments[0].mathPos[3]).toBe(17); });
    errs([]);
});

describe('scan $d statement:', function () {
    src('$d a b $.')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is DV segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.DV); });
    it('has math string', function () { expect(db.segments[0].math).toEqual(['a','b']); });
    errs([]);
});

describe('scan $v statement:', function () {
    src('$v a b $.')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('is VAR segment', function () { expect(db.segments[0].type).toBe(mmom.Segment.VAR); });
    it('has math string', function () { expect(db.segments[0].math).toEqual(['a','b']); });
    errs([]);
});

describe('scan w/ Map argument:', function () {
    src((new Map).set('afile','${'))
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('${'); });
    errs([]);
});

describe('scan w/ resolver argument:', function () {
    var name;
    src(function (src) { name = src.name; src.text = '${'; })
    it('resolver got expected result', function () { expect(name).toBe('afile'); });
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('${'); });
    errs([]);
});

describe('simple file inclusion:', function () {
    src((new Map).set('afile','$[ bfile $]').set('bfile','$}'))
    it('has two segments', function () { expect(db.segments.length).toBe(2); });
    it('first is include per se', function () { expect(db.segments[0].type).toBe(mmom.Segment.INCLUDE); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('$[ bfile $]'); });
    it('second is close', function () { expect(db.segments[1].type).toBe(mmom.Segment.CLOSE); });
    it('containing source', function () { expect(db.segments[1].raw).toBe('$}'); });
    errs([]);
});

describe('inclusion of root file is ignored:', function () {
    src((new Map).set('afile','$[ afile $]'))
    it('has one segments', function () { expect(db.segments.length).toBe(1); });
    it('first is include per se', function () { expect(db.segments[0].type).toBe(mmom.Segment.INCLUDE); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('$[ afile $]'); });
    errs([]);
});

describe('inclusion of nonexistant file:', function () {
    src((new Map).set('afile','$[ bfile $]'))
    it('has one segments', function () { expect(db.segments.length).toBe(1); });
    it('first is include per se', function () { expect(db.segments[0].type).toBe(mmom.Segment.INCLUDE); });
    it('containing source', function () { expect(db.segments[0].raw).toBe('$[ bfile $]'); });
    errs([['bfile',0,'scanner','failed-to-read']]);
});

describe('comment spanning include:', function () {
    src((new Map).set('afile','$[ bfile $] text $)').set('bfile','$( comment'))
    it('has 3 segments', function () { expect(db.segments.length).toBe(3); });
    it('first is include', function () { expect(seg(db,0)).toEqual([mmom.Segment.INCLUDE,'$[ bfile $]',null,null]); });
    it('second is comment fragment in an EOF', function () { expect(seg(db,1)).toEqual([mmom.Segment.EOF,'$( comment',null,null]); });
    it('third is trailing portion of wrapping file in an EOF', function () { expect(seg(db,2)).toEqual([mmom.Segment.EOF,' text $)',null,null]); });
    it('nonterminated comment error', function () { expect(err(db,0)).toEqual(['bfile',10,'scanner','eof-in-comment']); });
    it('loose $) error', function () { expect(err(db,1)).toEqual(['afile',17,'scanner','loose-comment-end']); });
    it('spurious label error', function () { expect(err(db,2)).toEqual(['afile',19,'scanner','spurious-label']); });
});

describe('nested comment:', function () {
    src('$( foo $( bar $)')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('first is comment', function () { expect(seg(db,0)).toEqual([mmom.Segment.COMMENT,'$( foo $( bar $)',null,null]); });
    errs([['afile',7,'scanner','nested-comment']]);
});

describe('bad characters in comment:', function () {
    src('$( \u001f \u007f $)')
    errs([
        ['afile',3,'scanner','bad-character'],
        ['afile',5,'scanner','bad-character'],
    ]);
});

describe('token with bad characters skipped', function () {
    src('$c a b\u001fc d $.')
    it('segment count', function () { expect(db.segments.length).toBe(1); });
    it('bad token skipped', function () { expect(seg(db,0)).toEqual([mmom.Segment.CONST,'$c a b\u001fc d $.',['a','d'],null]); });
    errs([ ['afile',5,'scanner','bad-character'] ]);
});

describe('not a nested comment:', function () {
    src('$( x$( $a $q $)')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('first is comment', function () { expect(seg(db,0)).toEqual([mmom.Segment.COMMENT,'$( x$( $a $q $)',null,null]); });
    errs([]);
});

describe('false comment end:', function () {
    src('$( x$)x $)')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('first is comment', function () { expect(seg(db,0)).toEqual([mmom.Segment.COMMENT,'$( x$)x $)',null,null]); });
    errs([ ['afile',3,'scanner','pseudo-comment-end'] ]);
});

describe('unterminated directive:', function () {
    src('$[')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('first is EOF (uninterpreted)', function () { expect(seg(db,0)).toEqual([mmom.Segment.EOF,'$[',null,null]); });
    errs([ ['afile',2,'scanner','unterminated-directive'] ]);
});

describe('bad/missing filename:', function () {
    src('$[ $foo $]')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('first is EOF (uninterpreted)', function () { expect(seg(db,0)).toEqual([mmom.Segment.EOF,'$[ $foo $]',null,null]); });
    errs([
        ['afile',3,'scanner','dollar-in-filename'],
        ['afile',8,'scanner','missing-filename'],
    ]);
});

describe('two tokens in include:', function () {
    src('$[ afile bfile $]')
    it('has one segment', function () { expect(db.segments.length).toBe(1); });
    it('first is include (extra token ignored)', function () { expect(seg(db,0)).toEqual([mmom.Segment.INCLUDE,'$[ afile bfile $]',null,null]); });
    errs([['afile',9,'scanner','directive-too-long']]);
});

describe('attempt to span file end with directive:', function () {
    src(new Map().set('afile','$[ bfile $] $]').set('bfile','$[ cfile'))
    it('has three segments', function () { expect(db.segments.length).toBe(3); });
    it('first is include', function () { expect(seg(db,0)).toEqual([mmom.Segment.INCLUDE,'$[ bfile $]',null,null]); });
    it('second is uninterpretable', function () { expect(seg(db,1)).toEqual([mmom.Segment.EOF,'$[ cfile',null,null]); });
    it('third is uninterpretable', function () { expect(seg(db,2)).toEqual([mmom.Segment.EOF,' $]',null,null]); });
    errs([
        ['bfile',8,'scanner','unterminated-directive'],
        ['afile',12,'scanner','loose-directive-end'],
    ]);
});

describe('missing proof:', function () {
    src('foo $p x y $.')
    it('has 1 segments', function () { expect(db.segments.length).toBe(1); });
    it('first is $p', function () { expect(seg2(db,0)).toEqual([mmom.Segment.PROVABLE,'foo $p x y $.',['x','y'],[],'foo']); });
    errs([ ['afile',11,'scanner','missing-proof'] ]);
});

describe('valid $p statement:', function () {
    src('   foo $p x y $= z $( k $) w $.')
    it('has 1 segments', function () { expect(db.segments.length).toBe(1); });
    it('first is $p', function () { expect(seg2(db,0)).toEqual([mmom.Segment.PROVABLE,'   foo $p x y $= z $( k $) w $.',['x','y'],['z','w'],'foo']); });
    it('label position', function () { expect(pos(db,0,'startPos')).toEqual(['afile',3]); });
    it('math positions', function () { expect(pos(db,0,'mathPos')).toEqual(['afile',10,'afile',12]); });
    it('proof positions', function () { expect(pos(db,0,'proofPos')).toEqual(['afile',17,'afile',27]); });
    errs([]);
});

describe('valid $a statement:', function () {
    src('   foo $a x y $.')
    it('has 1 segments', function () { expect(db.segments.length).toBe(1); });
    it('first is $a', function () { expect(seg2(db,0)).toEqual([mmom.Segment.AXIOM,'   foo $a x y $.',['x','y'],null,'foo']); });
    it('label position', function () { expect(pos(db,0,'startPos')).toEqual(['afile',3]); });
    it('math positions', function () { expect(pos(db,0,'mathPos')).toEqual(['afile',10,'afile',12]); });
    errs([]);
});

describe('valid $e statement:', function () {
    src('   foo $e x y $.')
    it('has 1 segments', function () { expect(db.segments.length).toBe(1); });
    it('first is $e', function () { expect(seg2(db,0)).toEqual([mmom.Segment.ESSEN,'   foo $e x y $.',['x','y'],null,'foo']); });
    errs([]);
});

describe('valid $f statement:', function () {
    src('   foo $f x y $.')
    it('has 1 segments', function () { expect(db.segments.length).toBe(1); });
    it('first is $f', function () { expect(seg2(db,0)).toEqual([mmom.Segment.FLOAT,'   foo $f x y $.',['x','y'],null,'foo']); });
    errs([]);
});

describe('spurious proof:', function () {
    src('   foo $f x y $= z $.')
    it('has 1 segments', function () { expect(db.segments.length).toBe(1); });
    it('first is $f', function () { expect(seg2(db,0)).toEqual([mmom.Segment.BOGUS,'   foo $f x y $= z $.',['x','y','z'],null,'foo']); });
    errs([['afile',14,'scanner','spurious-proof']]);
});

describe('spurious proof 2:', function () {
    src('   foo $p x $= y $= z $.')
    it('has 1 segments', function () { expect(db.segments.length).toBe(1); });
    it('first is discarded', function () { expect(seg2(db,0)).toEqual([mmom.Segment.BOGUS,'   foo $p x $= y $= z $.',['x'],['y','z'],'foo']); });
    errs([ ['afile',17,'scanner','spurious-proof'] ]);
});

describe('stray $. w/o label:', function () {
    src('$.')
    it('has 1 segments', function () { expect(db.segments.length).toBe(1); });
    it('first is $f', function () { expect(seg2(db,0)).toEqual([mmom.Segment.BOGUS,'$.',null,null,null]); });
    errs([ ['afile',0,'scanner','spurious-period'] ]);
});

describe('stray $. w/ label:', function () {
    src('foo $.')
    it('has 1 segments', function () { expect(db.segments.length).toBe(1); });
    it('first is $f', function () { expect(seg2(db,0)).toEqual([mmom.Segment.BOGUS,'foo $.',null,null,'foo']); });
    errs([ ['afile',4,'scanner','spurious-period'] ]);
});
