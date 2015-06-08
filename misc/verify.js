var fs = require('fs');
var path = require('path');
var mmom = require('../src/MMOM.js');
var Scoper = require('../src/Scoper.js');
var Verify = require('../src/Verify.js');
var time_1 = Date.now();
var db = mmom.Scanner.parseSync( path.basename(process.argv[2]), fs.readFileSync(process.argv[2],'utf8'));
var time_2 = Date.now();
process.stdout.write(`parse ${time_2 - time_1} ms\n`,'utf8');
db.scanErrors.forEach(function(e) {
    process.stdout.write(e.toString() + "\n", 'utf8');
});
time_1 = Date.now();
Scoper.install(db);
time_2 = Date.now();
process.stdout.write(`scope ${time_2 - time_1}ms\n`,'utf8');
db.plugins.scoper.errors.forEach(function(e) {
    process.stdout.write(e.toString() + "\n", 'utf8');
});
time_1 = Date.now();
var verifd = 0;
Verify.install(db);
db.segments.forEach(function (s,ix) {
    if (s.type === mmom.Segment.PROVABLE) {
        verifd++;
        var err = Verify.install(db).verify(ix,false);
        if (err.length) process.stdout.write(`${s.label} ERR\n`,'utf8');
        err.forEach(function (e) {
            process.stdout.write(e.toString() + "\n", 'utf8');
        });
    }
});
time_2 = Date.now();
process.stdout.write(`verify ${verifd} $p ${time_2 - time_1}ms\n`,'utf8');
