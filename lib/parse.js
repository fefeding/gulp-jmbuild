
var path = require("path");
var fs = require("fs");
var ast = require('cmd-util').ast;
var through = require("through2");
var gutil = require("gulp-util");
var uglify = require('gulp-uglify');
var cssuglify = require('gulp-minify-css');

var PluginError = gutil.PluginError;

var pluginName = 'gulp-jmbuild-parse';

var cache = require('./cache');

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
            gutil.log(gutil.colors.cyan('warning:'), gutil.colors.yellow(pluginName + "[cmd]: the file " + file.path + " is not valid"));
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
        cache.setCache(key, info);
	}

    //解析html，从html中提取cmd入口和<script>标签
    function parseHtml(file, options) {
        var buildInfo = cache.getCache();

        gutil.log(gutil.colors.cyan('parseHtml:'), gutil.colors.green(file.path));

        var content = file.contents.toString();
        if(!options.debug) content = inlineFile(content, options, buildInfo);
        content = replacePkgAndUri(content, options, buildInfo);
        file.contents = new Buffer(content);
    }

    //内联处理
    function inlineFile(content, options, buildInfo) {
        var reg = /(__cmdinline|__inline)\s*\(\s*([^\)]+)\s*\)\s*[;]*/ig;
        //console.log('start replace __cmdinline/__inline');
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
            gutil.log(gutil.colors.red('warning[inline]:'), gutil.colors.yellow(pluginName + ": the file " + filepath + " is not exists"));
        }
        return content;
    }

    //替换html中的__pkg路径
    function replacePkgAndUri(content, options, buildInfo) {
        var reg = /(__pkg|__uri)\s*\(\s*([^\)]+)\s*\)/ig;
        return content.replace(reg, function(s, m, p) {
            var jp = p.trim().replace(/(^['"]*)|(['"]*$)/g, '');
            if(jp){
                var ext = path.extname(jp);
                var dest = {'.js':options.jsDestPath,'.css':options.cssDestPath}[ext] || options.destPath;
                var fpath = path.join(dest, jp);
                if(!buildInfo[fpath]) {
                    fpath = path.join(options.destPath, jp);
                }
                //如果有md5则，合到路径中
                var info = buildInfo[fpath];
                s = jp;
                if(info) {
                    if(info.path) s =  path.dirname(jp) + '/' + path.basename(info.path);
                    else s = jp;
                }
                //当用的是__pkg则继续转为字符串，加引号，uri不需要
                if(m == '__pkg') {
                    s = '"' + s + '"';
                }
            }
            gutil.log(gutil.colors.blue('replace:'), gutil.colors.green(s));
            return s;
        });
    }

    //处理css
    function parseCSS(file, options) {
        var buildInfo = cache.getCache();

        gutil.log(gutil.colors.cyan('parseCSS:'), gutil.colors.green(file.path));

        var content = file.contents.toString();
        content = replaceCSSUrl(content, options, buildInfo);
        content = inlineCSS(file, content, options, buildInfo);
        file.contents = new Buffer(content);
    }

    //处理内联的css
    function inlineCSS(file, content, options, buildInfo) {
        var reg = /@import\s*url\(\s*['"]?([^\)]+?)(\?__inline)?['"]?\s*\)\s*[;]*/ig;
        var dir = path.dirname(file.path);
        return content.replace(reg, function(s, p, i){
            //相对于css构建目标目录
            var filepath = path.resolve(dir, p);
            if(!fs.existsSync(filepath)){
                gutil.log(gutil.colors.cyan('warning:'), gutil.colors.red(pluginName + ": the file " + filepath + " is not exists"));
                return;
            }

            var csscontent = fs.readFileSync(filepath, 'utf-8');
            //处理其中的url
            csscontent = replaceCSSUrl(csscontent, options, buildInfo);
            gutil.log(gutil.colors.blue('inlineCSS:'), gutil.colors.green(filepath));
            return csscontent;
        });
    }

    //处理css中的url路径，或加上md5码
    function replaceCSSUrl(content, options, buildInfo) {
        var reg = /url\s*\(\s*([^\)]+?)(\?[^\)]*?)?\s*\)/ig;
        return content.replace(reg, function(s, p, i) {
                var fpath = path.join(options.dest, p);
                var spath = path.join(options.base, p);
                var info = buildInfo[fpath] || buildInfo[spath];                
                //如果有md5则，合到路径中
                if(info && info.path) {
                    s = s.replace(p, path.dirname(p) + '/' + path.basename(info.path));
                }

            gutil.log(gutil.colors.blue('css url:'), gutil.colors.green(s));
            return s;
        });
    }
}