import util from "./util.js";

class test {
    utilInstance = new util()
    init() {
        document.body.innerHTML = ('<h1>' + this.utilInstance.add(1,2) + '</h1>')
    }
}

export default test;

if(typeof define != 'undefined') {
    define('/mb/action/test/index', function(require, exports, module) {
        module.exports = test;
    })
}