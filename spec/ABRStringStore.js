var ABRStringStore = require('../src/ABRStringStore.js');

describe('The constant-weight iteration', function () {
    it('takes 1 to 2', function() { expect(ABRStringStore._nextSameWeight(1)).toBe(2); });
    it('takes 2 to 4', function() { expect(ABRStringStore._nextSameWeight(2)).toBe(4); });
    it('takes 3 to 5', function() { expect(ABRStringStore._nextSameWeight(3)).toBe(5); });
    it('finds 35 3-out-of-7 codes', function() {
        var t = [], i;
        for (i = 0x07; i <= 0x70; i = ABRStringStore._nextSameWeight(i)) t.push(i);
        expect(t.length).toBe(35);
    });
    it('wraps at bit 30 correctly', function() { expect(ABRStringStore._nextSameWeight(0x30000000)).toBe(0x40000001); });
    it('works up to the max', function() { expect(ABRStringStore._nextSameWeight(0x7FFFFFFD)).toBe(0x7FFFFFFE); });
});

describe('The string store object', function () {
    var ss;
    beforeEach(function () { ss = new ABRStringStore(); });
    describe('Tree construction and dumping', function () {
        it('gives one fixed node for the empty string', function () { expect(ss.dump(ss.emptyString)).toBe('!E'); });
        it('creates a node for a singleton', function () { expect(ss.dump(ss.singleton(7))).toBe('7'); });
        it('deduplicates singleton nodes', function () { expect(ss.singleton(7)).toBe(ss.singleton(7)); });
        it('creates different nodes for different singletons', function () { expect(ss.singleton(8)).not.toBe(ss.singleton(9)); });
        it('creates runs for repeated values', function () { expect(ss.dump(ss.concat(ss.singleton(5),ss.singleton(5)))).toBe('[5(*2)]'); });
        it('creates groups for dissimilar values', function () { expect(ss.dump(ss.concat(ss.singleton(5),ss.singleton(6)))).toBe('[5 6]'); });
    });
    // that's about all we can do without being hypersensitive to details of the segmenter

    // generate ranges (as arrays)
    function range(lo, hi, mod) {
        var out = [];
        for (var i = lo; i <= hi; i++)
            out.push(mod ? i % mod : i);
        return out;
    }

    // the Thue-Morse sequence is highly repetitive but cube-free, so repeat counts will never exceed 2
    function thue(order) {
        var t0 = ss.singleton(0), t1 = ss.singleton(1); // t0 = Thue-Morse at current order; t1 = reversed complement

        while (order--) {
            var tn0 = ss.concat(t0,t1);
            var tn1 = ss.concat(t1,t0);
            t0 = tn0; t1 = tn1;
        }
        return t0;
    }

    describe('Round-tripping', function () {
        it('preserves a non-repeating sequence', function () { expect(ss.toArray(ss.fromArray(range(1,100)),[],200)).toEqual(range(1,100)); });
        it('preserves a highly repeating sequence', function () { expect(ss.toArray(ss.fromArray(range(1,100,3)),[],200)).toEqual(range(1,100,3)); });
        it('preserves a structured nonrepeating sequnce', function () { expect(ss.toArray(thue(3))).toEqual([0,1,1,0,1,0,0,1]); });
    });

    describe('Canonical concatenation', function () {
        it('non-repeating sequence, 70/30 split', function () { expect(ss.concat(ss.fromArray(range(1,70)),ss.fromArray(range(71,100)))).toBe(ss.fromArray(range(1,100))); });
        it('non-repeating sequence, 99/1 split', function () { expect(ss.concat(ss.fromArray(range(1,99)),ss.fromArray(range(100,100)))).toBe(ss.fromArray(range(1,100))); });
        it('non-repeating sequence, 100/0 split', function () { expect(ss.concat(ss.fromArray(range(1,100)),ss.fromArray(range(101,100)))).toBe(ss.fromArray(range(1,100))); });
        it('non-repeating sequence, incremental construction', function () {
            var str = ss.emptyString;
            for (var i = 1; i <= 100; i++) str = ss.concat(str, ss.singleton(i));
            expect(str).toBe(ss.fromArray(range(1,100)));
        });
        it('repeating sequence, 70/30 split', function () { expect(ss.concat(ss.fromArray(range(1,70,3)),ss.fromArray(range(71,100,3)))).toBe(ss.fromArray(range(1,100,3))); });
        it('repeating sequence, 99/1 split', function () { expect(ss.concat(ss.fromArray(range(1,99,3)),ss.fromArray(range(100,100,3)))).toBe(ss.fromArray(range(1,100,3))); });
        it('repeating sequence, incremental construction', function () {
            var str = ss.emptyString;
            for (var i = 1; i <= 100; i++) str = ss.concat(str, ss.singleton(i % 3));
            expect(str).toBe(ss.fromArray(range(1,100, 3)));
        });
    });

    describe('Length calculation', function () {
        it('empty string', function () { expect(ss.length(ss.emptyString)).toBe(0); });
        it('singleton', function () { expect(ss.length(ss.singleton(5))).toBe(1); });
        it('long nonrepeating string', function () { expect(ss.length(ss.fromArray(range(1,100)))).toBe(100); });
        it('long repeating string', function () { expect(ss.length(ss.fromArray(range(1,100,3)))).toBe(100); });
        it('long structured string', function () { expect(ss.length(thue(32))).toBe(Math.pow(2,32)); });
    });

    function thingBeing(obj) {
        return {
            asymmetricMatch: function (obj2) { return obj2 === obj; },
        };
    }

    describe('Split', function () {
        it('returns two-element array', function () { expect(ss.split(ss.emptyString,0)).toEqual([thingBeing(ss.emptyString), thingBeing(ss.emptyString)]); });
        it('at left edge', function () { expect(ss.split(ss.singleton(5),0)).toEqual([thingBeing(ss.emptyString), thingBeing(ss.singleton(5))]); });
        it('at right edge', function () { expect(ss.split(ss.singleton(5),1)).toEqual([thingBeing(ss.singleton(5)), thingBeing(ss.emptyString)]); });
        it('10/90 split non-repeat seq', function () { expect(ss.split(ss.fromArray(range(1,100)),10)).toEqual([thingBeing(ss.fromArray(range(1,10))), thingBeing(ss.fromArray(range(11,100)))]); });
        it('10/90 split repeat seq', function () { expect(ss.split(ss.fromArray(range(1,100,3)),10)).toEqual([thingBeing(ss.fromArray(range(1,10,3))), thingBeing(ss.fromArray(range(11,100,3)))]); });
        it('split and rejoin structured sequence', function () { var t = thue(24); expect(ss.concat.apply(ss,ss.split(t,1000000))).toBe(t); });
    });

    describe('takes longest common prefix', function () {
        it('of "" and "" to 0', function () { expect(ss.lcp(ss.emptyString, ss.emptyString)).toBe(0); });
        it('of "" and anything else to 0', function () { expect(ss.lcp(ss.emptyString, ss.singleton(5))).toBe(0); });
        it('of anything and "" to 0', function () { expect(ss.lcp(ss.singleton(5), ss.emptyString)).toBe(0); });
        it('of two equal singletons to 1', function () { expect(ss.lcp(ss.singleton(5), ss.singleton(5))).toBe(1); });
        it('of two unequal singletons to 0', function () { expect(ss.lcp(ss.singleton(5), ss.singleton(4))).toBe(0); });
        it('of two equal repetitive strings', function () { expect(ss.lcp(ss.fromArray(range(1,10,1)), ss.fromArray(range(1,10,1)))).toBe(10); });
        it('of two equal nonrepetitive strings', function () { expect(ss.lcp(ss.fromArray(range(1,10)), ss.fromArray(range(1,10)))).toBe(10); });
        it('of two related nonrepetitive strings', function () { expect(ss.lcp(ss.fromArray(range(1,20)), ss.fromArray(range(1,10)))).toBe(10); });
        it('of two related repetitive strings', function () { expect(ss.lcp(ss.fromArray(range(1,20,1)), ss.fromArray(range(1,10,1)))).toBe(10); });
        it('of two related structured strings', function () { expect(ss.lcp(thue(20), thue(21))).toBe(Math.pow(2,20)); });
        it('of two structured strings with different prefixes', function () { expect(ss.lcp(ss.concat(ss.singleton(2),thue(20)), ss.concat(ss.singleton(3),thue(20)))).toBe(0); });
        it('of two structured strings with different suffixes', function () { expect(ss.lcp(ss.concat(thue(20),ss.singleton(2)), ss.concat(thue(20),ss.singleton(3)))).toBe(Math.pow(2,20)); });
    });

    describe('compares', function () {
        it('"" and "" equal', function () { expect(ss.compare(ss.emptyString, ss.emptyString)).toBe(0); });
        it('"" less than anything else', function () { expect(ss.compare(ss.emptyString, ss.singleton(5))).toBe(-1); });
        it('anything else greater than ""', function () { expect(ss.compare(ss.singleton(5), ss.emptyString)).toBe(1); });
        it('two equal singletons equal', function () { expect(ss.compare(ss.singleton(5), ss.singleton(5))).toBe(0); });
        it('two equal singletons equal (by equality function)', function () { expect(ss.equal(ss.singleton(5), ss.singleton(5))).toBe(true); });
        it('two unequal singletons by default comparison', function () { expect(ss.compare(ss.singleton(5), ss.singleton(6))).toBe(-1); });
        it('two unequal singletons by default comparison', function () { expect(ss.compare(ss.singleton(6), ss.singleton(5))).toBe(1); });
        it('two unequal singletons by overridden comparison', function () { ss.singletonComparer = function (a,b) { return b-a; }; expect(ss.compare(ss.singleton(6), ss.singleton(5))).toBe(-1); });
        it('two unequal singletons unequal (by equality function)', function () { expect(ss.equal(ss.singleton(6), ss.singleton(5))).toBe(false); });
        it('two structured strings with different suffixes by suffix', function () { expect(ss.compare(ss.concat(thue(20),ss.singleton(2)), ss.concat(thue(20),ss.singleton(3)))).toBe(-1); });
    });

    describe('takes longest common suffix', function () {
        it('of "" and "" to 0', function () { expect(ss.lcs(ss.emptyString, ss.emptyString)).toBe(0); });
        it('of "" and anything else to 0', function () { expect(ss.lcs(ss.emptyString, ss.singleton(5))).toBe(0); });
        it('of anything and "" to 0', function () { expect(ss.lcs(ss.singleton(5), ss.emptyString)).toBe(0); });
        it('of two equal singletons to 1', function () { expect(ss.lcs(ss.singleton(5), ss.singleton(5))).toBe(1); });
        it('of two unequal singletons to 0', function () { expect(ss.lcs(ss.singleton(5), ss.singleton(4))).toBe(0); });
        it('of two equal repetitive strings', function () { expect(ss.lcs(ss.fromArray(range(1,10,1)), ss.fromArray(range(1,10,1)))).toBe(10); });
        it('of two equal nonrepetitive strings', function () { expect(ss.lcs(ss.fromArray(range(1,10)), ss.fromArray(range(1,10)))).toBe(10); });
        it('of two related nonrepetitive strings', function () { expect(ss.lcs(ss.concat(ss.fromArray(range(11,20)),ss.fromArray(range(1,10))), ss.fromArray(range(1,10)))).toBe(10); });
        it('of two related repetitive strings', function () { expect(ss.lcs(ss.fromArray(range(1,20,1)), ss.fromArray(range(1,10,1)))).toBe(10); });
        it('of two related structured strings', function () { expect(ss.lcs(thue(20), thue(22))).toBe(Math.pow(2,20)); });
        it('of two structured strings with different prefixes', function () { expect(ss.lcs(ss.concat(ss.singleton(2),thue(20)), ss.concat(ss.singleton(3),thue(20)))).toBe(Math.pow(2,20)); });
    });


    //new ABRStringStore().fromArray([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
    //new ABRStringStore().fromArray([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
    //new ABRStringStore().fromArray([1,2,3,4,5,5,5,8,9,10]);
    //new ABRStringStore().fromArray([1,2,3,4,5,1,2,3,4,6]);
});
