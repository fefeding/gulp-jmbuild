define("test/dir/d", [ "../../b" ], function(require, exports, module) {
    var b = require("../../b");
    exports.init = function() {
        b.init("d");
    };
});