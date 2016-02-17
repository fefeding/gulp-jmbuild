
//支持md5或扩展名称
var through = require("through2");
var path = require("path");
var gutil = require("gulp-util");
var PluginError = gutil.PluginError;

var crypto = require('crypto');
var fs = require("fs");

var pluginName = 'gulp-jmbuild-rename';

var cache = require('./cache');

//给文件生成md5路径后缀
exports.md5 = function(opt) {
    opt = opt || {};
    var stream = through.obj(function (file, enc, cb) {
        if (!file) {
            this.emit("error", new PluginError(pluginName, "files can not be empty"));
            return cb();
        }
        else if (file.isNull()) {
            return cb();
        }
        else {            
            calcMd5(file, function(md5Hash) {
                if(md5Hash) {
                    var size = opt.size || 8;
                    //截取指定长度的md5码
                    if(size > 0 && size < md5Hash.length) md5Hash = md5Hash.slice(0, size);
                    var key = file.path;
                    if (file.path[0] == '.') {
                      key = path.join(file.base, file.path);
                    }
                    //在文件名后缀前加上md5
                    file.path = createMd5Path(key, md5Hash, (opt.separator || '.'), opt);//path.join(dir, basename + (opt.separator || '.') + md5Hash + ext);

                    //缓存当前md5信息
                    var info = {
                        "path": file.path,
                        "md5": md5Hash
                    };
                    cache.setCache(key, info);
                }
                stream.push(file);
                cb();
            });            
        }
    });
    return stream;
}

//生成文件md5码
function calcMd5(file, callback) {
  var md5 = crypto.createHash('md5');
  //如果是流，则以流的方式处理
  if(file.isStream()) {
    var s = fs.createReadStream(file.path, {flags:'r'});
    s.on('error', function(){
        callback && callback();
    });
    //s.on('data', md5.update.bind(md5));
    s.on('data', function(d){
        md5.update(d);
    });
    s.on('end', function () {
      var hex = md5.digest('hex');      
      callback && callback(hex);
    });
  }
  else {
    md5.update(file.contents, 'utf8');
    var hex = md5.digest('hex');
    callback && callback(hex);
    return hex;
  }
}

//初始化更名，收集当前文件集的路径集合，以备多文件合并后的映射
exports.initSource = function() {
    var stream = through.obj(function (file, enc, cb) {
        if (!file) {
            this.emit("error", new PluginError(pluginName, "files can not be empty"));
            return cb();
        }
        var sources = cache.getInfo('source_list') || [];
        var p = file.path;
        if (p[0] == '.') {
          p = path.join(file.base, file.path);
        }
        sources.push(p);
        //console.log('initSource');
        //console.log(p);
        cache.setCache('source_list', sources);

        this.push(file);
        cb();                   
        
    });
    return stream;
}

//结束收集文件名集合，写入缓存
exports.endSource = function() {
    var stream = through.obj(function (file, enc, cb) {
        if (!file) {
            this.emit("error", new PluginError(pluginName, "files can not be empty"));
            return cb();
        }
        var sources = cache.getInfo('source_list')
        if(sources) {
            var info = cache.getInfo(file.path)||{};
            for(var i=0;i<sources.length;i++) {
                var key = sources[i];
                var tmpinfo = {"path": key, "md5": info.md5, "id": info.id}
                //缓存当前md5信息                
                tmpinfo.dest = file.path;
                cache.setCache(key, tmpinfo);
            }
            //console.log('endSource');
            //console.log(file.path);
            //重置
            cache.setCache('source_list', []);
        }
        this.push(file);
        cb();                   
        
    });
    return stream;
}

//给文件名加扩展
exports.expandName = function(opt) {
    opt = opt || {};
    var stream = through.obj(function (file, enc, cb) {
        if (!file) {
            this.emit("error", new PluginError(pluginName, "files can not be empty"));
            return cb();
        }
        else if (file.isNull()) {
            return cb();
        }
        else {       
            if(opt.expand) {
                //在文件名加上扩展
                var ext = path.extname(file.path);
                var basename = path.basename(file.path, ext);
                file.path = path.join(path.dirname(file.path), basename+opt.separator+opt.expand+ext).replace(/\\/g,'/');
            }     
            
            this.push(file);
            cb();                   
        }
    });
    return stream;
}

//给文件更名，如果有md5则加上，或有扩展名，也加上
exports.changeFileName = function(opt) {
     opt = opt || {};
    var stream = through.obj(function (file, enc, cb) {
        if (!file) {
            this.emit("error", new PluginError(pluginName, "files can not be empty"));
            return cb();
        }
        else if (file.isNull()) {
            return cb();
        }
        else {   
            if(opt.md5) {         
                calcMd5(file, function(md5Hash) {
                    if(md5Hash) {
                        var size = opt.size || 8;
                        //截取指定长度的md5码
                        if(size > 0 && size < md5Hash.length) md5Hash = md5Hash.slice(0, size);                        
                    }
                    var key = file.path;
                    if (file.path[0] == '.') {
                      key = path.join(file.base, file.path);
                    }
                    //在文件名后缀前加上md5
                    file.path = createMd5Path(key, md5Hash, (opt.separator || '.'), opt.expand, opt);

                    //缓存当前md5信息
                    var info = {
                        "path": file.path,
                        "md5": md5Hash
                    };
                    cache.setCache(key, info);

                    stream.push(file);
                    cb();
                });            
            }
            else {
                if(opt.expand) {
                    file.path = createMd5Path(file.path, '', (opt.separator || '.'), opt.expand, opt);
                }
                stream.push(file);
                cb();
            }
        }
    });
    return stream;
}

//据md5生成路径
function createMd5Path(oldpath, md5, separator, expand, opt) {
    var ext = path.extname(oldpath);
    var basename = path.basename(oldpath, ext);
    if(expand) ext = separator + expand + ext;
    if(md5) {
        //如果指定了md5合的的方式，则使用配置的函数来处理
        if(opt && typeof opt.md5 == 'function') {
            ext = opt.md5(ext, md5);
        }
        else {
            ext = separator + md5 + ext;
        }        
    }
    return path.join(path.dirname(oldpath), basename + ext).replace(/\\/g,'/');
}