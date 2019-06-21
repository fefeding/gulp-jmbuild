define("test/c", [ "../b" ], function(i, n, t) {
    var b = i("../b");
    n.init = function() {
        b.init("b");
    };
});

define("b", [ "./a" ], function(require, exports, module) {
    var a = require("./a");
    exports.init = function() {
        a.run("b");
    };
});

define("a", [], function(require, exports, module) {
    exports.run = function() {
        alert("i am a");
    };
});