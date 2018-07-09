//前端构建
//路径配置均可以用../此类相对路径
/*
    config格式：
{
    "debug": false,//如果是true,则不全合并和压缩文件，也不会打md5码
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
    "separator": ".",
    //md5码取多少位，
    "md5Size": 8,
    //JS需要构建的配置
    "js": [
        {
            //构建源，跟gulp的source方法保持一致，可以是单个文件/目录*.js/数组
            //以下所有类同
            "source": "static/js/*.js",
            //是否加上md5后缀,默认false
            'md5': true,
            //名称扩展，会直接加到文件名后缀前,例如：a.324242.lc.js
            "expand": 'lc'
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
var gulpconcat = require('gulp-concat');
var uglify = require('gulp-uglify');
var cleanCSS = require('gulp-clean-css');
var rename = require('gulp-rename');
var PluginError = gutil.PluginError;
var through = require("through2");
var path = require("path");
var Q = require('q');
var jmrename = require('./lib/rename');
var cache = require('./lib/cache');
var parse = require('./lib/parse');
const gulp = require('gulp');

var pluginName = 'gulp-jmbuild';

//cache
exports.cache = cache;

//组合资源配置，返回组件的资源数组
exports.getSources = function(config) {
    var sources = [];
    //当传入多个组合时，循环处理每个
    if(arguments.length > 1) {
        for(var i=0;i<arguments.length;i++) {
            var c = arguments[i];
            if(Array.isArray(c)) {
                var r = this.getSources(c);
                sources = sources.concat(r);
            }
        }
        return sources;
    }    
    if(config && config.length) {
        for(var i=0;i<config.length;i++) {
            if(typeof config[i] == 'string') {
                sources.push(config[i]);
            }
            else {
                if(Array.isArray(config[i].source)) {
                    sources = sources.concat(config[i].source);
                }
                else {
                    sources.push(config[i].source);
                }
            }
        }
    }
    return sources;
}

//监控文件变动
exports.watch = function(gulp, config, callback, startFun, endFun) {
    if(!this.taskMapping) this.taskMapping = {};
    if(config.js && config.js.length) {
        for(var i=0;i<config.js.length;i++) {
            var s = config.js[i];
            watchJSTask(gulp, s, config, callback, startFun, endFun);
        }
    }    
    if(config.files && config.files.length) {
        for(var i=0;i<config.files.length;i++) {
            var s = config.files[i];
            watchFILETask(gulp, s, config, callback, startFun, endFun);
        }
    }    
    if(config.css && config.css.length) {
        for(var i=0;i<config.css.length;i++) {
            var s = config.css[i];
            watchCSSTask(gulp, s, config, callback, startFun, endFun);
        }
    }    
    if(config.html && config.html.length) {
        for(var i=0;i<config.html.length;i++) {
            var s = config.html[i];
            watchHTMLTask(gulp, s, config, callback, startFun, endFun);
        }
    }    
}

//监控任务缓存
function watchTaskCache(key, type, obj) {
    return obj || null;//暂时不缓存, 因为使用缓存后，任务过一段时间就会失效！
    type = type || 'default';
    exports.taskMapping[type] = exports.taskMapping[type] || {};
    if(obj) {
        return exports.taskMapping['type'][key] = obj;
    }
    var task = exports.taskMapping['type'][key];
    return task;
}

//监控JS文件
function watchJSTask(gulp, s, config, callback, startFun, endFun) {
    gulp.watch(s.source || s, {cwd:config.root}, function(evt) {
        //如果已存在当前task，则直返回
        var task = watchTaskCache(evt.path, 'js');
        //用缓存，发现过一段时间task就不能跑了！！！
        if(!task) {
            task = watchTaskCache(evt.path, 'js', {});
            task.name = evt.path;
            task.path = evt.path;      
            task.destPath = path.resolve(config.root, config.dest || '', config.jsDest || '', s.dest || ''); //js目标构建目录

            //debug模式下，文件按原本的路径拷贝
            if(config.debug) {
                task.path = task.path.replace(/\\/g,'/');
                var mdpath = s.subPath || s.dest || '';             
                if(mdpath) {
                    var mindex = task.path.indexOf(mdpath);
                    if(mindex >= 0) {
                        //截取文件后面的部分，从而保证部署和原路径中间段一致
                        task.destPath = path.join(task.destPath, path.dirname(task.path).substr(mindex + mdpath.length));
                    }
                }
            }
            task.dest = path.join(task.destPath, path.basename(task.path));   
            //生成监听构建任务
            _watchJSCreateTask(gulp, task, s, config, startFun, endFun);         
        }
        callback && callback(task, s, evt);
    });
}

//创建监听JS文件任务
function _watchJSCreateTask(gulp, task, s, config, startFun, endFun) {
    //把构建目标路径传给执行函数
    s.__dest = task.destPath;
    s.source = task.path;
    gulp.task(task.name, function(){
        
        return runJSTaskStream(gulp, s, config, startFun, endFun);
    });            
    //gutil.log(gutil.colors.cyan('[watch]:'), gutil.colors.green('create js task ' + task.name));
}

//监控普通文件
function watchFILETask(gulp, s, config, callback, startFun, endFun) {
    gulp.watch(s.source || s, {cwd:config.root, buffer: typeof s.buffer == 'undefined'?true:s.buffer}, function(evt) {
        //如果已存在当前task，则直返回
        var task = watchTaskCache(evt.path, 'file');
        if(!task) {
            //用缓存，发现过一段时间task就不能跑了！！！
            task = watchTaskCache(evt.path, 'file', {});
            task.name = evt.path;
            task.path = evt.path;
            task.destPath = path.resolve(config.root, config.dest || '', config.fileDest || '', s.dest || ''); //file目标构建目录
            //debug模式下，文件按原本的路径拷贝
            if(config.debug) {
                task.path = task.path.replace(/\\/g,'/');
                var mdpath = s.subPath || s.dest || '';                   
                if(mdpath) {
                    var mindex = task.path.indexOf(mdpath);
                    if(mindex >= 0) {
                        //截取文件后面的部分，从而保证部署和原路径中间段一致
                        task.destPath = path.join(task.destPath, path.dirname(task.path).substr(mindex + mdpath.length));
                    }
                }
            }
            task.dest = path.join(task.destPath, path.basename(task.path));
            //生成监听构建任务
            _watchFILECreateTask(gulp, task, s, config, startFun, endFun);
        }
        callback && callback(task, s, evt);
    });
}

//创建监听FILE文件任务
function _watchFILECreateTask(gulp, task, s, config, startFun, endFun) {
    //把构建目标路径传给执行函数
    s.__dest = task.destPath;
    s.source = task.path;
    gulp.task(task.name, function(){                
        return runFileTaskStream(gulp, s, config,  startFun, endFun);
    });
    //gutil.log(gutil.colors.cyan('[watch]:'), gutil.colors.green('create file task ' + task.name));
}

//监控css文件
function watchCSSTask(gulp, s, config, callback, startFun, endFun) {
    
    gulp.watch(s.source || s, {cwd:config.root}, function(evt) {  
        //如果已存在当前task，则直返回
        var task = watchTaskCache(evt.path, 'css');
        if(!task) {
            task = watchTaskCache(evt.path, 'css', {});
            task.name = evt.path;
            task.path = evt.path;
            task.destPath = path.resolve(config.root, config.dest || '', config.cssDest || '', s.dest || ''); //css目标构建目录
            //debug模式下，文件按原本的路径拷贝
            if(config.debug) {
                task.path = task.path.replace(/\\/g,'/');
                var mdpath = s.subPath || s.dest || '';                     
                if(mdpath) {
                    var mindex = task.path.indexOf(mdpath);
                    if(mindex >= 0) {
                        //截取文件后面的部分，从而保证部署和原路径中间段一致
                        task.destPath = path.join(task.destPath, path.dirname(task.path).substr(mindex + mdpath.length));
                    }
                }
            }
            task.dest = path.join(task.destPath, path.basename(task.path));
            //生成监听构建任务
            _watchCSSCreateTask(gulp, task, s, config, startFun, endFun);
        }
        callback && callback(task, s, evt);
    });
}

//创建监听CSS文件任务
function _watchCSSCreateTask(gulp, task, s, config, startFun, endFun) {
    //把构建目标路径传给执行函数
    s.__dest = task.destPath;
    s.source = task.path;
    gulp.task(task.name, function(){        
        return runCSSTaskStream(gulp, s, config, startFun, endFun);
    });
    //gutil.log(gutil.colors.cyan('[watch]:'), gutil.colors.green('create css task ' + task.name));
}

//监控html文件
function watchHTMLTask(gulp, s, config, callback, startFun, endFun) {
    gulp.watch(s.source || s, {cwd:config.root}, function(evt) {        
        //如果已存在当前task，则直返回
        var task = watchTaskCache(evt.path, 'html');
        if(!task) {
            task = watchTaskCache(evt.path, 'html', {});
            //用缓存，发现过一段时间task就不能跑了！！！       
            task.name = evt.path;
            task.path = evt.path;
            task.destPath = path.resolve(config.root, config.dest || '', config.htmlDest || '', s.dest || '');
            //debug模式下，文件按原本的路径拷贝
            if(config.debug) {
                task.path = task.path.replace(/\\/g,'/');
                var mdpath = s.subPath || s.dest || '';                    
                if(mdpath) {
                    var mindex = task.path.indexOf(mdpath);
                    if(mindex >= 0) {
                        //截取文件后面的部分，从而保证部署和原路径中间段一致
                        task.destPath = path.join(task.destPath, path.dirname(task.path).substr(mindex + mdpath.length));
                    }
                }
            }            
            task.dest = path.join(task.destPath, path.basename(task.path)); 
            //生成监听构建任务
            _watchHTMLCreateTask(gulp, task, s, config, startFun, endFun);
        }
        callback && callback(task, s, evt);
    });
}

//创建监听HTML文件任务
function _watchHTMLCreateTask(gulp, task, s, config, startFun, endFun) {
    //把构建目标路径传给执行函数
    s.__dest = task.destPath;
    s.source = task.path;
    gulp.task(task.name, function(){
        return runHTMLTaskStream(gulp, s, config, startFun, endFun);
    });
    //gutil.log(gutil.colors.cyan('[watch]:'), gutil.colors.green('create html task ' + task.name));
}

//生成js编译任务
exports.jsTask =
exports.createJSTask = function(gulp, config, depTasks, startFun, endFun) {
    var jstasks = [];
    if(!config.js || !config.js.length) return jstasks;
    //var taskIndex = 0;
    
    for(var i=0;i<config.js.length;i++) {
        var taskname = pluginName + "_minify_js_" + i;
        _createJSTask(gulp, taskname, config, depTasks, i, startFun, endFun);
        jstasks.push(taskname);
    }
    return jstasks;
}

//借用闭包，处理gulp的task中index
function _createJSTask(gulp, name, config, depTasks, index, startFun, endFun) {
    gulp.task(name, depTasks, function(cb){
        var s = config.js[index];
       return runJSTaskStream(gulp, s, config, startFun, endFun, cb);
    });
}
//对js文件流进行处理
function runJSTaskStream(gulp, s, config, startFun, endFun, cb) {
    if(s.__dest) {
        var dest = s.__dest;
    }
    else {
        var jsDestPath = path.join(config.root, config.dest || '', config.jsDest || ''); //js目标构建目录
        var dest = path.join(jsDestPath, s.dest || '');
    }
    var stream = gulp.src(s.source || s, {cwd:config.root, base: s.base || ''});
    //初始化流源
    //stream = stream.pipe(jmrename.initSource());

    if(!config.debug) {
        stream = stream.pipe(parse.parse({
            "base": path.join(config.root,s.base || config.jsBase),
            "type": 'js',
            "md5size": config.md5size,
            "debug": config.debug,
            "config": s,
            "root": config.root,
            "destPath": path.join(config.root, config.dest || '')
        }));
    }
     if(startFun && typeof startFun == 'function') {
        stream = startFun(stream, s);
     }

     if(s.concat && !config.debug){
        stream = stream.pipe(gulpconcat(s.concat));
    }
    if(s.rename){
       stream = stream.pipe(rename(s.rename));
    }

    //把原文件拷贝一份,以备其它地方引用//不 能去掉，否则inline可能会出问题
    //所以其它地方引用，只能引用rename/concat之后的
    stream = stream.pipe(gulp.dest(dest));

    //只有在非debug下才进行压缩
     if(!config.debug) {
        //uglify支持原配置参数，请参考:https://github.com/terinjokes/gulp-uglify#user-content-options
        stream = stream.pipe(uglify(s.uglify||{}));
     }

    //给文件名加扩展
    if(!config.debug && (s.md5 || s.expand)) {        
        //加上md5或文件名扩展
        stream = stream.pipe(jmrename.changeFileName({"separator": config.separator, 'size': config.md5Size, 'md5': s.md5, 'expand': s.expand}));
    }

    if(endFun && typeof endFun == 'function') {
        stream = endFun(stream, s);
     }

    return stream.pipe(gulp.dest(dest))
     .pipe(cache.saveInfo(config));
     //.pipe(jmrename.endSource());
}

//普通文件任务
exports.fileTask =
exports.createFILETask = function(gulp, config, depTasks, startFun, endFun) {
    var tasks = [];
    if(!config.files || !config.files.length) return tasks;
    
    for(var i=0;i<config.files.length;i++) {
        var taskname = pluginName + "_minify_file_" + i;

        _createFileTask(gulp, taskname, config, depTasks, i, startFun, endFun);

        tasks.push(taskname);
    }
    return tasks;
}

//借用闭包，处理gulp的task中index
function _createFileTask(gulp, name, config, depTasks, index, startFun, endFun) {
    gulp.task(name, depTasks, function(){
        var s = config.files[index];
       return runFileTaskStream(gulp, s, config, startFun, endFun);
    });
}


//普通文件流处理
function runFileTaskStream(gulp, s, config, startFun, endFun) {
    if(s.__dest) {
        var dest = s.__dest;
    }
    else {
        var fileDestPath = path.resolve(config.root, config.dest || '', config.fileDest || ''); //file目标构建目录
        var dest = path.join(fileDestPath, s.dest || '');
    }
    var stream = gulp.src(s.source || s, {cwd:config.root, buffer: typeof s.buffer == 'undefined'?true:s.buffer, base: s.base || ''});
     //.pipe(gulp.dest(dest));
     if(startFun && typeof startFun == 'function') {
        stream = startFun(stream, s);
     }

     //如果有限制文件大小,单位KB
     if(s.maxSize) {
        stream = stream.pipe(checkFileSize(s));
     }

     if(s.concat && !config.debug) {
        stream = stream.pipe(gulpconcat(s.concat));
    }

     if(s.rename)
        stream = stream.pipe(rename(s.rename));

     //给文件名加扩展
    if(!config.debug && (s.md5 || s.expand)) {
        //把原文件拷贝一份,以备其它地方引用//不 能去掉，否则inline可能会出问题
        //所以其它地方引用，只能引用rename/concat之后的
        stream = stream.pipe(gulp.dest(dest));
        //加上md5或文件名扩展
        stream = stream.pipe(jmrename.changeFileName({"separator": config.separator, 'size': config.md5Size, 'md5': s.md5, 'expand': s.expand}));
    }

     if(endFun && typeof endFun == 'function') {
        stream = endFun(stream, s);
     }
    return stream.pipe(gulp.dest(dest)).pipe(cache.saveInfo(config));
}

//生成css构建任务
exports.cssTask =
exports.createCSSTask = function(gulp, config, depTasks, startFun, endFun) {
    var tasks = [];
    if(!config.css || !config.css.length) return tasks;
    
    for(var i=0;i<config.css.length;i++) {
        var taskname = pluginName + "_minify_css_" + i;

        _createCSSTask(gulp, taskname, config, depTasks, i, startFun, endFun);

        tasks.push(taskname);
    }
    return tasks;
}

//借用闭包，处理gulp的task中index
function _createCSSTask(gulp, name, config, depTasks, index, startFun, endFun) {
    gulp.task(name, depTasks, function(){
        var s = config.css[index];
       return runCSSTaskStream(gulp, s, config, startFun, endFun);
    });
}

//CSS文件流任务处理
function runCSSTaskStream(gulp, s, config, startFun, endFun) {
    if(s.__dest) {
        var dest = s.__dest;
    }
    else {
        var cssDestPath = path.resolve(config.root, config.dest || '', config.cssDest || ''); //css目标构建目录
        var dest = path.join(cssDestPath, s.dest || '');
    }

    var stream = gulp.src(s.source || s, {cwd:config.root, base: s.base || ''});
     //.pipe(gulp.dest(dest));
    if(startFun && typeof startFun == 'function') {
        stream = startFun(stream, s);
     }

     //为了修改stream中的filepath为发布路径，，以用计算相对路径
    stream = stream.pipe(gulp.dest(dest));

    stream = stream.pipe(parse.parse({
            "type": 'css',
            "dest": dest,
            "debug": config.debug,
            "urlMaps": config.urlMaps || [],
            "config": s,
            "destPath": path.resolve(config.root, config.dest || '')
        }));    

     if(s.concat && !config.debug){   
        stream = stream.pipe(gulpconcat(s.concat));
    }
     if(s.rename)
        stream = stream.pipe(rename(s.rename));

    //把原文件拷贝一份,以备其它地方引用//不 能去掉，否则inline可能会出问题
    //所以其它地方引用，只能引用rename/concat之后的
    stream = stream.pipe(gulp.dest(dest));
    
    //只有在非debug下才进行压缩
    if (!config.debug && config.cssMinify !== false) {
        stream = stream.pipe(cleanCSS());
    }

     //给文件名加扩展
    if(!config.debug && (s.md5 || s.expand)) {
        //加上md5或文件名扩展
        stream = stream.pipe(jmrename.changeFileName({"separator": config.separator, 'size': config.md5Size, 'md5': s.md5, 'expand': s.expand}));
    }

    if(endFun && typeof endFun == 'function') {
        stream = endFun(stream, s);
     }

    return stream.pipe(gulp.dest(dest))
     .pipe(cache.saveInfo(config));
}

//生成html解析任务
exports.htmlTask =
exports.createHTMLTask = function(gulp, config, depTasks, startFun, endFun) {  
  var htmlTasks = []; 

  for(var i=0;i<config.html.length;i++) {
      var taskname = pluginName + "_parse_html_" + i;
      htmlTasks.push(taskname);
      _createHTMLTask(gulp, taskname, config, depTasks, i, startFun, endFun);
  }
  return htmlTasks;
}

//借用闭包，处理gulp的task中index
function _createHTMLTask(gulp, name, config, depTasks, index, startFun, endFun) {
    gulp.task(name, depTasks, function(){
        var s = config.html[index];
       return runHTMLTaskStream(gulp, s, config, startFun, endFun);        
    });
}

//html文件流任务处理
function runHTMLTaskStream(gulp, s, config, startFun, endFun) {    
    var destPath = path.resolve(config.root, config.dest || '');
    var jsDestPath = path.resolve(destPath, config.jsDest || ''); //js目标构建目录
    var cssDestPath = path.resolve(destPath, config.cssDest || ''); //css目标构建目录
    var htmlDestPath = path.resolve(destPath, config.htmlDest || ''); //html目标构建目录
    var fileDestPath = path.resolve(destPath, config.fileDest || ''); //file目标构建目录

    if(s.__dest) {
        var dest = s.__dest;
    }
    else {
        var dest = path.resolve(destPath, config.htmlDest || '', s.dest || '');
    }

    var stream = gulp.src(s.source || s, {cwd:config.root, base: s.base || ''});
    if(startFun && typeof startFun == 'function') {
        stream = startFun(stream, s);
     }

     //为了修改stream中的filepath为发布路径，，以用计算相对路径
     stream = stream.pipe(gulp.dest(dest));

     stream = stream.pipe(parse.parse({
            "type": 'html',
            "debug": config.debug,
            "root": config.root,
            "dest": dest,
            "destPath": destPath,
            "jsDestPath": jsDestPath,
            "cssDestPath": cssDestPath,
            "htmlDestPath": htmlDestPath,
            "fileDestPath": fileDestPath,
            "urlMaps": config.urlMaps || [],
            "config": s
        })).pipe(gulp.dest(dest));

     if(s.rename) {
        stream = stream.pipe(rename(s.rename));
     }
     if(endFun && typeof endFun == 'function') {
        stream = endFun(stream, s);
     }
     return stream.pipe(gulp.dest(dest));
}

//限制文件大小，如果文件过大，则报错
function checkFileSize(opt) {    
    var stream = through.obj(function (file, enc, cb) {
        //有大小限制
        if(opt && opt.maxSize > 0) {
            var size = file.contents.length / 1024;//转为KB
            if(size > opt.maxSize) {
                gutil.log(gutil.colors.red('file size error:', '('+size.toFixed(2)+'KB)'+file.path));
                this.emit("error", new PluginError('file size error', '文件大于' + opt.maxSize + 'KB '));
            }
            
        }
        this.push(file);
        cb();
    });
    return stream;
}
