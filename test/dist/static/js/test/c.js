define("test/c", [ "../b" ], function(require, exports, module) {
    var b = require("../b");
    exports.init = function() {
        b.init("b");
    };
});