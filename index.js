//前端构建
//路径配置均可以用../此类相对路径
/*
    config格式：
{
    //项目根路径，后面的路径基本都是相对于它的。
    "root": path.resolve('../'),   
    //构建目标目录，相对于root
    "dest": "dist",
    //js文件构建目标目录，相对于dest,,,如果你想把它放在不同的地方，可以用类似于../这种改变根路径的方法。
    "jsDest": "static/js",
    //html文件构建目标目录，相对于dest
    "htmlDest": "",
    //css文件构建目标目录，相对于dest
    "cssDest": "static/css",
    //JS文件基础路径段，主要用于模块化提取模块id用处，比例在static/js/test/a.js  构建时就会取static/js后的test/a做为模块id
    "jsBase": "static/js",
    //文件md5后缀的分隔符，例如：a.{md5}.js
    "md5Separator": ".",
    //md5码取多少位，
    "md5Size": 8,
    //JS需要构建的配置
    "js": [
        {
            //构建源，跟gulp的source方法保持一致，可以是单个文件/目录*.js/数组
            //以下所有类同
            "source": "static/js/*.js",
            //是否加上md5后缀,默认false
            'md5': true
        },
        {
            "source": ["static/js/test/**\*.js"],
            //用于把source中的所有文件合并到同一个文件，并命名为此配置值
            "concat": "t.js",
            'md5': true,
            //当前配置发布位置，相对于jsDest配置，如果不配置则默认放到jsDest下。
            "dest": 'test'
        }
    ],
    "css": [
        {
            "source": "static/css/*.css",
            "md5": true
        }
    ],
    "html": [
        {
            "source": "index.html",
            //当有inline模块化js文件时，理否把它依赖的模块一同内嵌进来，默认为false
            "includeModule": true
        }
    ],
    //普通文件构建，可以用于图片拷贝和打md5码
    "files": [
        {
            "source": "static/img/*.*",
            "md5": true,
            "dest": "static/img"
        }
    ]
};
 */
var Stream = require('stream');
var gutil = require("gulp-util");
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var cssuglify = require('gulp-minify-css');
var rename = require('gulp-rename');
var Q = require('q');
var PluginError = gutil.PluginError;
var through = require("through2");
var path = require("path");
var util = require("util");
var fs = require("fs");
var crypto = require('crypto');
var ast = require('cmd-util').ast;

//缓存文件
var file_name = 'build_cache_' + new Date().getTime() + '_' + Math.floor(Math.random() * 100);
var file_cache_dir = path.resolve('./cache');
if(!fs.existsSync(file_cache_dir)) fs.mkdir(file_cache_dir, '0777');
var file_cache_name = path.join(file_cache_dir,file_name);

var pluginName = 'gulp-jmbuild';


exports.parse =  function(options) {
    options = options || {};   
    
    var stream = through.obj(function (file, enc, cb) {

        if (!file) {
            this.emit("error", new PluginError(pluginName, "files can not be empty"));
            return cb();
        }
        else if (file.isNull()) {
            return cb();
        }

        else if (file.isStream()) {
            this.emit("error", new PluginError(pluginName, "streaming not supported"));
            return cb();
        }

        else if (file.isBuffer()) {
            if (!options.base) {
                options.base = file.base;
            }
            //根据后缀处理文件类型
            var ext = path.extname(file.path).toLowerCase();
            if(options.type == 'js') parseJS.call(this, file, options);
            else if(options.type == 'html') parseHtml.call(this, file, options);
            else if(options.type == 'css') parseCSS.call(this, file, options);

            this.push(file);
            cb();
        }
        else {
            gutil.log(gutil.colors.cyan('warning:'), "there's something wrong with the file");
            return cb();
        }
    });
    return stream;

    /*
	 根据base路径解析当前模块的相对id
	 */
	function parseModuleId(filepath, transportBase) {
		transportBase = transportBase.replace(/\\/g, "/");
		filepath = filepath.replace(/\\/g, "/");
        
		var index = filepath.indexOf(transportBase);
		if(transportBase && index > -1) {
			id = filepath.substr(index + transportBase.length).replace(/^\/|\.\w+$/g, "");
		}
		else {
			id = path.basename(filepath).replace(/^\/|\.\w+$/g, "");
		}		
		return id;
	}

    //转换cmd模块代码
	function parseJS(file, options) {
        gutil.log(gutil.colors.cyan('parseJS:'), gutil.colors.green(file.path));

		var content = file.contents.toString();
		var astModule = ast.parseFirst(content);
        
		if (!astModule) {

            gutil.log(gutil.colors.cyan('warning:'), gutil.colors.yellow(pluginName + ": the file " + file.path + " is not valid"));
			return
		}
		if(!astModule.id) {
			astModule.id = parseModuleId(file.path, options.base);
		}

        gutil.log(gutil.colors.cyan('module id:'), gutil.colors.green(astModule.id));

		content = ast.modify(content, astModule).print_to_string({beautify: true});	
		file.contents = new Buffer(content);
    
        var info = {
            "path": file.path,
            "id": astModule.id
        };
        var key = file.path;
        if (file.path[0] == '.') {
          key = path.join(file.base, file.path);
        } 
        setCache(key, info);
	}

    //解析html，从html中提取cmd入口和<script>标签
    function parseHtml(file, options) {
        var buildInfo = getCache();
       
        gutil.log(gutil.colors.cyan('parseHtml:'), gutil.colors.green(file.path));
       
        var content = file.contents.toString();
        content = inlineFile(content, options, buildInfo);
        content = replacePkgAndUri(content, options, buildInfo);
        file.contents = new Buffer(content);
    }

    //内联处理
    function inlineFile(content, options, buildInfo) {
        var reg = /(__cmdinline|__inline)\s*\(\s*([^\)]+)\s*\)\s*[;]*/ig;
        console.log('start replace __cmdinline/__inline');
        var reqModuleJS = {};//已inline过的js模块
        return content.replace(reg, function(s, p, i){  
            var ps = RegExp.$2.split(',');
            var jscontent = '';
            if(ps && ps.length) {
                for(var j=0;j<ps.length;j++) {
                    var jp = ps[j].trim().replace(/(^['"]*)|(['"]*$)/g, '');
                    if(!jp) continue;
                    //相对于js构建目标目录
                    if(jp[0] != '/' && jp[0] != '.') {
                        var ext = path.extname(jp);
                        var dest = {'.js':options.jsDestPath,'.css':options.cssDestPath}[ext] || options.destPath;
                        var filepath = path.join(dest, jp);  
                    }
                    else {
                        //相对于当前html路径
                        var filepath = path.join(options.dest, jp);  
                    }
                    jscontent += readInlineContent(filepath, buildInfo, reqModuleJS, options) + '\n';
                }                
            } 
            return jscontent;           
        });
    }

    //递归处理依赖,deps=当前文件的依赖
    function readInlineContent(filepath, buildInfo, arrs, options) {
        if(!arrs) arrs = {};

        var content = '';
        var filecontent = '';
        if(buildInfo && buildInfo[filepath]) {
            var info = buildInfo[filepath];
            //如果 有处理md5,则使用md5版本
            if(info && info.path) {
                filepath = info.path;
                filecontent = info.content;
            }
        }

        //如果已经处理过，则直接返回空
        if(arrs[filepath]) return '';
        
        if(filecontent || fs.existsSync(filepath)) {
            arrs[filepath] = 1;//表示当前路径js已inline过了，            
            gutil.log(gutil.colors.blue('inline file:'), gutil.colors.green(filepath));
            filecontent = filecontent || fs.readFileSync(filepath, 'utf-8');
            //如果指定需要包含依赖
            if(options.config.includeModule && path.extname(filepath) == '.js') {
                //解析当前脚本依赖，把所有依赖全inline进页面
                var astModule = ast.parseFirst(filecontent);            
                //如果包含依赖
                if(astModule && astModule.dependencies && astModule.dependencies.length) {
                    var dir = path.dirname(filepath);
                    for(var i=0;i<astModule.dependencies.length;i++) {
                        var id = astModule.dependencies[i];
                        //如果不是相对路径，则使用js的目标目录
                        if(id[0] != '/' && id[0] != '.') {
                            var p = path.resolve(options.jsDestPath, id);
                        }
                        else {
                            //相对当于前调用js的路径
                            var p = path.resolve(dir, id);
                        }
                        
                        if(!path.extname(p)) p += '.js';
                       // console.log('inline module:' + p);
                        content += readInlineContent(p, buildInfo, arrs, options) + "\n";
                    }
                }
            }
            content += filecontent;
        }
        else {
            gutil.log(gutil.colors.red('warning:'), gutil.colors.yellow(pluginName + ": the file " + filepath + " is not exists"));
        }
        return content;
    }

    //替换html中的__pkg路径
    function replacePkgAndUri(content, options, buildInfo) {
        var reg = /(__pkg|__uri)\s*\(\s*([^\)]+)\s*\)\s*[;]*/ig; 
        return content.replace(reg, function(s, p, i){  
            var ps = RegExp.$2.split(',');
            if(ps && ps.length) {
                for(var j=0;j<ps.length;j++) {
                    var jp = ps[j].trim().replace(/(^['"]*)|(['"]*$)/g, '');
                    if(!jp) continue;
                    var ext = path.extname(jp);
                    var dest = {'.js':options.jsDestPath,'.css':options.cssDestPath}[ext] || options.destPath;
                    var fpath = path.join(dest, jp);
                    if(!buildInfo[fpath]) {
                        fpath = path.join(options.destPath, jp);
                    }
                    //如果有md5则，合到路径中
                    if(buildInfo[fpath] && buildInfo[fpath].md5) {
                        s = s.replace(jp, createMd5Path(jp, buildInfo[fpath].md5, options.md5Separator || '.'));
                    }
                } 
                gutil.log(gutil.colors.blue('replace:'), gutil.colors.green(s));               
            } 
            return s;           
        });
    }

    //处理css
    function parseCSS(file, options) {
        var buildInfo = getCache();
       
        gutil.log(gutil.colors.cyan('parseCSS:'), gutil.colors.green(file.path));
       
        var content = file.contents.toString();
        content = replaceCSSUrl(content, options, buildInfo);
        content = inlineCSS(file, content, options, buildInfo);
        file.contents = new Buffer(content);
    }

    //处理内联的css
    function inlineCSS(file, content, options, buildInfo) {
        var reg = /@import\s*url\(\s*['"]?([^\)]+?)\?__inline['"]?\s*\)\s*[;]*/ig; 
        var dir = path.dirname(file.path);
        return content.replace(reg, function(s, p, i){ 
            //相对于css构建目标目录
            var filepath = path.resolve(dir, p);
            var csscontent = fs.readFileSync(filepath, 'utf-8'); 
            //处理其中的url
            csscontent = replaceCSSUrl(csscontent, options, buildInfo);  
            gutil.log(gutil.colors.blue('inlineCSS:'), gutil.colors.green(filepath));            
            return csscontent;           
        });
    }

    //处理css中的url路径，或加上md5码
    function replaceCSSUrl(content, options, buildInfo) {
        var reg = /url\s*\(\s*([^\)]+?)\s*\)/ig;
        return content.replace(reg, function(s, p, i) {
                var fpath = path.join(options.dest, p); 
                //如果有md5则，合到路径中
                if(buildInfo[fpath] && buildInfo[fpath].md5) {
                    s = s.replace(p, createMd5Path(p, buildInfo[fpath].md5, options.md5Separator || '.'));
                }
           
            gutil.log(gutil.colors.blue('css url:'), gutil.colors.green(s)); 
            return s;           
        });
    }
}

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

        else if (file.isStream()) {
            this.emit("error", new PluginError(pluginName, "streaming not supported"));
            return cb();
        }

        else if (file.isBuffer()) {
            var md5Hash = calcMd5(file, opt.size || 8);
            var key = file.path;
            if (file.path[0] == '.') {
              key = path.join(file.base, file.path);
            } 
            var dir = path.dirname(key);
            var ext = path.extname(key);
            var basename = path.basename(key, ext);
            //在文件名后缀前加上md5
            file.path = path.join(dir, basename + (opt.separator || '.') + md5Hash + ext);

            //缓存当前md5信息
            var info = {
                "path": file.path,
                "md5": md5Hash
            };
            setCache(key, info);

            this.push(file);
            cb();
        }
        else {
            gutil.log(gutil.colors.cyan('warning:'), "there's something wrong with the file");
            return cb();
        }
    });
    return stream;
}

//生成文件md5码
function calcMd5(file, slice) {
  var md5 = crypto.createHash('md5');
  md5.update(file.contents, 'utf8');

  return slice > 0 ? md5.digest('hex').slice(0, slice) : md5.digest('hex');
}

//获取当前流的路径
//经过各插件处理后的路径
function saveInfo(opt) {
    var stream = new Stream.Transform({objectMode: true});    
    stream._transform = function(file, unused, callback) {  
        var key = file.path;
        if (key[0] == '.') {
          key = path.join(file.base, key);
        }
        var info = {
            "path": key
        };
        /*
        //如果路径中有md5，则处理md5码，后截取路径
        if(opt && opt.md5Separator) {
            var li = key.lastIndexOf(opt.md5Separator);
            if(li >= 0) {
                var di = info.path.lastIndexOf('.');
                if(di == -1) di = info.path.length;
                var start = li + opt.md5Separator.length;
                info.md5 = info.path.substring(start, di);
                key = info.path.replace(opt.md5Separator + info.md5, '');
            }
        } */       
        setCache(key, info);
        callback(null, file);
      };
    return stream;   
}

//获取当前编译信息
function getInfo() {
    return getCache();
}

//清除缓存文件
exports.clearInfo = function() {
    if(fs.existsSync(file_cache_name)) {
        fs.unlinkSync(file_cache_name);
    }
}


function setCache(key, value) {
    var obj = getCache();
    if(!obj) obj = {};
    if(typeof value == 'object') {
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
    var json = JSON.stringify(obj);
    fs.writeFileSync(file_cache_name, json, 'utf-8');
}

function getCache() {
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

//据md5生成路径
function createMd5Path(oldpath, md5, md5Separator) {
    var ext = path.extname(oldpath);
    var basename = path.basename(oldpath, ext);
    return path.join(path.dirname(oldpath), basename+md5Separator+md5+ext).replace(/\\/g,'/');
}


//生成js编译任务
exports.jsTask =
exports.createJSTask = function(gulp, config, depTasks, startFun, endFun) {
    var jstasks = [];
    if(!config.js || !config.js.length) return jstasks;
    var taskIndex = 0;
    var jsDestPath = path.resolve(config.root, config.dest || '', config.jsDest || ''); //js目标构建目录
    for(var i=0;i<config.js.length;i++) { 
        var taskname = pluginName + "_minify_js_" + i;
        gulp.task(taskname, depTasks, function(){
            var s = config.js[taskIndex];
            taskIndex ++;
            var dest = path.join(jsDestPath, s.dest || '');
            var stream = gulp.src(s.source || s, {cwd:config.root}) 
             .pipe(exports.parse({
                    "base": path.resolve(config.root,config.jsBase),
                    "type": 'js',
                    "config": s
                }));
             if(startFun && typeof startFun == 'function') {
                stream = startFun(stream);
             }
             stream.pipe(uglify())
             .pipe(gulp.dest(dest));
             
             if(s.concat) 
              stream = stream.pipe(concat(s.concat)).pipe(gulp.dest(dest));         
             if(s.rename) 
              stream = stream.pipe(rename(s.rename)).pipe(gulp.dest(dest));

             if(s.md5) 
              stream = stream.pipe(exports.md5({"separator": config.md5Separator, 'size': config.md5Size}));

            if(endFun && typeof endFun == 'function') {
                stream = endFun(stream);
             }
            return stream.pipe(gulp.dest(dest))
             .pipe(saveInfo(config));
        });

        jstasks.push(taskname);        
    }
    return jstasks;
}

//普通文件任务
exports.fileTask =
exports.createFILETask = function(gulp, config, depTasks, startFun, endFun) {
    var tasks = [];
    if(!config.files || !config.files.length) return tasks;
    var taskIndex = 0;
    var fileDestPath = path.resolve(config.root, config.dest || '', config.fileDest || ''); //file目标构建目录
    for(var i=0;i<config.files.length;i++) { 
        var taskname = pluginName + "_minify_file_" + i;
        gulp.task(taskname, depTasks, function(){
            var s = config.files[taskIndex];
            taskIndex ++;
            var dest = path.join(fileDestPath, s.dest || '');
            var stream = gulp.src(s.source || s, {cwd:config.root})
             .pipe(gulp.dest(dest));
             if(startFun && typeof startFun == 'function') {
                stream = startFun(stream);
             }
             if(s.concat) 
              stream = stream.pipe(concat(s.concat)).pipe(gulp.dest(dest));         
             if(s.rename) 
              stream = stream.pipe(rename(s.rename)).pipe(gulp.dest(dest));

             if(s.md5) 
              stream = stream.pipe(exports.md5({"separator": config.md5Separator, 'size': config.md5Size})).pipe(gulp.dest(dest));
             if(endFun && typeof endFun == 'function') {
                stream = endFun(stream);
             }
            return stream.pipe(saveInfo(config));
        });

        tasks.push(taskname);        
    }
    return tasks;
}

//生成css构建任务
exports.cssTask = 
exports.createCSSTask = function(gulp, config, depTasks, startFun, endFun) {
    var tasks = [];
    if(!config.css || !config.css.length) return tasks;
    var taskIndex = 0;
    var cssDestPath = path.resolve(config.root, config.dest || '', config.cssDest || ''); //css目标构建目录
    for(var i=0;i<config.css.length;i++) { 
        var taskname = pluginName + "_minify_css_" + i;
        gulp.task(taskname, depTasks, function(){
            var s = config.css[taskIndex];
            taskIndex ++;
            var dest = path.join(cssDestPath, s.dest || '');
            var stream = gulp.src(s.source || s, {cwd:config.root});
            if(startFun && typeof startFun == 'function') {
                stream = startFun(stream);
             }
            stream.pipe(exports.parse({
                    "type": 'css',
                    "dest": dest,
                    "config": s
                }))              
             .pipe(cssuglify())
             .pipe(gulp.dest(dest));
             
             if(s.concat) 
              stream = stream.pipe(concat(s.concat)).pipe(gulp.dest(dest));         
             if(s.rename) 
              stream = stream.pipe(rename(s.rename)).pipe(gulp.dest(dest));

             if(s.md5) 
              stream = stream.pipe(exports.md5({"separator": config.md5Separator, 'size': config.md5Size}));

            if(endFun && typeof endFun == 'function') {
                stream = endFun(stream);
             }
            return stream.pipe(gulp.dest(dest))
             .pipe(saveInfo(config));
        });

        tasks.push(taskname);        
    }
    return tasks;
}


//生成html解析任务
exports.htmlTask = 
exports.createHTMLTask = function(gulp, config, depTasks, startFun, endFun) {
  var htmlTaskIndex = 0;
  var htmlTasks = [];
  var destPath = path.resolve(config.root, config.dest || '');
  var jsDestPath = path.resolve(destPath, config.jsDest || ''); //js目标构建目录
  var cssDestPath = path.resolve(destPath, config.cssDest || ''); //css目标构建目录  
  var htmlDestPath = path.resolve(destPath, config.htmlDest || ''); //html目标构建目录
  var fileDestPath = path.resolve(destPath, config.fileDest || ''); //file目标构建目录

  for(var i=0;i<config.html.length;i++) { 
      var taskname = pluginName + "_parse_html_" + i;
      htmlTasks.push(taskname);
      gulp.task(taskname, depTasks, function(){
        var s = config.html[htmlTaskIndex];
        htmlTaskIndex++;

        var dest = path.resolve(destPath, config.htmlDest || '', s.dest || '');
        var stream = gulp.src(s.source || s, {cwd:config.root});
        if(startFun && typeof startFun == 'function') {
            stream = startFun(stream);
         }
         stream.pipe(exports.parse({
                "type": 'html',
                "root": config.root,
                "destPath": destPath,
                "jsDestPath": jsDestPath,
                "cssDestPath": cssDestPath,
                "htmlDestPath": htmlDestPath,
                "fileDestPath": fileDestPath,
                "dest": dest,
                "config": s
            })).pipe(gulp.dest(dest));
                 
         if(s.rename) {
            stream = stream.pipe(rename(s.rename));
         }
         if(endFun && typeof endFun == 'function') {
            stream = endFun(stream);
         }
         return stream.pipe(gulp.dest(dest));
    });
  }
  return htmlTasks;
}