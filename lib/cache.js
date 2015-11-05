
var path = require("path");
var fs = require("fs");
var through = require("through2");
var util = require('util');
var gutil = require("gulp-util");

//缓存文件
var file_name = 'build_cache_' + new Date().getTime() + '_' + Math.floor(Math.random() * 100);
var file_cache_dir = path.resolve('./cache');
if(!fs.existsSync(file_cache_dir)) fs.mkdir(file_cache_dir, '0777');
var file_cache_name = path.join(file_cache_dir,file_name);



//获取当前编译信息
exports.getInfo = function(key) {    
    var infos = this.getCache();
    if(key) return infos[key];
    return infos;
}

//清除缓存文件
exports.clearInfo = function() {
    if(fs.existsSync(file_cache_name)) {
        fs.unlinkSync(file_cache_name);
    }
}

//写缓存
exports.setCache = function(key, value) {
    var obj = this.getCache();
    if(!obj) obj = {};
    if(typeof value == 'object' && !util.isArray(value)) {
        var info = obj[key];
        if(info){
            for(var k in value) {
                if(typeof value[k] == 'function') continue;
                info[k] = value[k];
            }
        }
        else {
            obj[key] = value;
        }
    }
    else {
        obj[key] = value;
    }
    var json = JSON.stringify(obj);
    fs.writeFileSync(file_cache_name, json, 'utf-8');
}

//获取缓存
exports.getCache = function() {
    if(fs.existsSync(file_cache_name)) {
        var json = fs.readFileSync(file_cache_name, 'utf-8');
        if(json) {
            return JSON.parse(json);
        }
    }
    else {
        return {};
    }
}


//获取当前流的路径
//经过各插件处理后的路径
exports.saveInfo = function(opt) {    
    var stream = through.obj(function (file, enc, cb) {
        var key = file.path;
        if (key[0] == '.') {
          key = path.join(file.base, key);
        }
        var info = {
            "path": key
        };
        gutil.log(gutil.colors.cyan('[build file]:'), gutil.colors.green(key));
        exports.setCache(key, info);
        this.push(file);
        cb();
    });
    return stream;
}