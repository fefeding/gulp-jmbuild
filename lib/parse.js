
var path = require("path");
var fs = require("fs");
var ast = require('cmd-util').ast;
var through = require("through2");
var gutil = require("gulp-util");
var uglify = require('gulp-uglify');

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
        //gutil.log(gutil.colors.cyan('parseJS:'), gutil.colors.green(file.path));

		var content = file.contents.toString();
		var astModule = ast.parseFirst(content);

		if (!astModule) {
            gutil.log(gutil.colors.cyan('warning:'), gutil.colors.yellow(pluginName + "[cmd]: the file " + file.path + " is not valid"));
			return
		}
		if(!astModule.id) {
			astModule.id = parseModuleId(file.path, options.base);
		}

        //gutil.log(gutil.colors.cyan('module id:'), gutil.colors.green(astModule.id));

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

        //gutil.log(gutil.colors.cyan('parseHtml:'), gutil.colors.green(file.path));

        var content = file.contents.toString();
        if(!options.debug) content = inlineFile(content, options, buildInfo, file);
        content = replacePkgAndUri(content, options, buildInfo, file);
        file.contents = new Buffer(content);
    }

    //内联处理
    function inlineFile(content, options, buildInfo, file) {
        var reg = /(__cmdinline|__inline)\s*\(\s*([^\)]+)\s*\)\s*[;]*/ig;
        //console.log('start replace __cmdinline/__inline');
        var reqModuleJS = {};//已inline过的js模块
        content = content.replace(reg, function(s, p, i){
            var ps = i.split(',');
            return inlineFileRegHandle(ps, buildInfo, options, reqModuleJS, file);
        });

        //处理<link rel="stylesheet" type="text/css"> 这种内联的方式，如果在属性加上?__inline则表示需要内联。
        reg = /\<link\s*[^\>]*?href\s*=\s*['|"]([^'"]+\?__inline)['|"][^\>]*?[\/]?\>/ig;
        content = content.replace(reg, function(s, p, i) {  
            var css = inlineFileRegHandle([p], buildInfo, options, reqModuleJS, file);
            //把文件内容放到style标签 中间
            if(css) {
                return '<style>\n' + css + '</style>';
            }            
        });

        //处理<script src=""> 这种内联的方式，如果在属性加上?__inline则表示需要内联。
        reg = /\<script\s*[^\>]*?src\s*=\s*['|"]([^'"]+\?__inline)['|"][^\>]*?[\/]?\>\s*?(\<\/script\>)?/ig;
        content = content.replace(reg, function(s, p, i) {  
            var js = inlineFileRegHandle([p], buildInfo, options, reqModuleJS, file);
            //把文件内容放到script标签 中间
            if(js) {
                return '<script type="text/javascript">\n' + js + '</script>';
            } 
        });
        return content;
    }

    //根据正则匹配到的路径，对文件进行内联处理
    function inlineFileRegHandle(regFiles, buildInfo, options, reqModuleJS, file) {        
        var content = '';
        if(regFiles && regFiles.length) {
            var destMP = {'.js':options.jsDestPath,'.css':options.cssDestPath};
            for(var j=0;j<regFiles.length;j++) {
                var jp = regFiles[j].trim().replace(/(^['"]*)|(['"]*$)/g, '');               
                if(!jp) continue;
                //去除?之后面路径
                if(jp.indexOf('?') > -1) jp = jp.substr(0, jp.indexOf('?'));

                if(jp[0] == '/') {
                    //相对于当前根路径
                    var filepath = path.join(options.destPath, jp);
                }
                //相对于js构建目标目录
                else if(jp[0] != '.') { 
                    var ext = path.extname(jp).toLowerCase();
                    var dest = destMP[ext] || options.destPath;
                    var filepath = path.join(dest, jp);
                    
                    //如果不存在，则相对于当前html发布路径
                    if(!fs.existsSync(filepath)) {                        
                        filepath = path.join(options.dest, jp); 
                    }//如果不存在，则相对于当前根发布路径
                    if(!fs.existsSync(filepath) && options.destPath) {                        
                        filepath = path.join(options.destPath, jp); 
                    }                              
                    //如果文件还是不存在，则相对于项目发布路径
                    if(!fs.existsSync(filepath)) {
                        console.log(filepath + ' not exists, check dest path!');
                        //相对于当前html文件                  
                        filepath = path.join(path.dirname(file.path), jp); 
                    }
                }
                else {
                    //相对于当前html路径
                    var filepath = path.join(options.dest, jp);
                }
                //读取内联的文件内容
                content += readInlineContent(filepath, buildInfo, reqModuleJS, options) + '\n';
            }
        }
        return content;
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
        var isjs = path.extname(filepath) == '.js';

        //如果已经处理过，则直接返回
        if(arrs[filepath]) {
            return isjs?'':arrs[filepath];
        }
         
        if(filecontent || fs.existsSync(filepath)) {
            
            //gutil.log(gutil.colors.blue('inline file:'), gutil.colors.green(filepath));
            filecontent = filecontent || fs.readFileSync(filepath, 'utf-8');
            //如果指定需要包含依赖
            if(isjs && options.config.includeModule) {
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
        arrs[filepath] = isjs?1:content;//表示当前路径已inline过了，
        return content;
    }

    //替换html中的__pkg路径
    function replacePkgAndUri(content, options, buildInfo, file) {
        //处理其中的__pkg和__uri函数路径
        var reg = /(__pkg|__uri)\s*\(\s*([^\)]+)\s*\)/ig;
        var destMaps = {'.js':options.jsDestPath,'.css':options.cssDestPath};

        content = content.replace(reg, function(s, m, p) {
            var jp = p.trim().replace(/(^['"]*)|(['"]*$)/g, '');
            if(jp){
                //处理md5码等后缀
                s = replaceUrlHandler(jp, options, buildInfo, destMaps, file.path);
            }
            //当用的是__pkg则继续转为字符串，加引号，uri不需要
            if(m == '__pkg') {
                s = '"' + s + '"';
            }
            //gutil.log(gutil.colors.blue('replace:'), gutil.colors.green(s));
            return s;
        });

        //处理<link rel="stylesheet" type="text/css" href=""> 这种url方式。
        reg = /\<link\s*[^\>]*?href\s*=\s*['|"]([^'"]+)['|"][^\>]*?[\/]?\>/ig;
        content = content.replace(reg, function(s, p, i) {  
            //处理md5码等后缀
            var newp = replaceUrlHandler(p, options, buildInfo, destMaps, file.path);
            //gutil.log(gutil.colors.blue('replace:'), gutil.colors.green(newp));
            return s.replace(p, newp);
        });

        //处理<script src=""> 这种src方式。
        reg = /\<script\s*[^\>]*?src\s*=\s*['|"]([^'"]+)['|"][^\>]*?[\/]?\>\s*?(\<\/script\>)?/ig;
        content = content.replace(reg, function(s, p, i) {  
            //处理md5码等后缀
            newp = replaceUrlHandler(p, options, buildInfo, destMaps, file.path);
            //gutil.log(gutil.colors.blue('replace:'), gutil.colors.green(newp));
            return s.replace(p, newp);
        });


        //处理<img src=""> 这种src方式。
        reg = /\<img\s*[^\>]*?src\s*=\s*['|"]([^'"]+)['|"][^\>]*?[\/]?\>/ig;
        content = content.replace(reg, function(s, p, i) {  
            //处理md5码等后缀
            newp = replaceUrlHandler(p, options, buildInfo, destMaps, file.path);
            //gutil.log(gutil.colors.blue('replace:'), gutil.colors.green(newp));
            return s.replace(p, newp);
        });
        return content;
    }

    //处理需要替换url的地址，主要是加上md5码等后缀
    function replaceUrlHandler(p, options, buildInfo, destMaps, filepath) {
        var tmp = p;
        //去除?之后面路径
        if(p.indexOf('?') > -1) tmp = p.substr(0, p.indexOf('?'));
        
        var ext = path.extname(tmp);
        var dest = destMaps[ext] || options.destPath;
        var fpath = path.normalize(path.join(dest, tmp));
        var info = buildInfo[fpath];
        if(!info) {
            fpath = path.join(options.destPath, tmp);
            info = buildInfo[fpath];
        }

        //如果上面的都不可以，则有可能是相对路径，
        if(!buildInfo[fpath] && filepath) {
            fpath = path.normalize(path.join(path.dirname(filepath), tmp));
            info = buildInfo[fpath];
        }

        if(info && info.path) {
            tmp =  path.dirname(tmp) + '/' + path.basename(info.path);
            //如果后续还有?部门，也截取到tmp中
            if(p.indexOf('?') > -1) {
                tmp += p.substr(p.indexOf('?'));
            }
        }

        //如果有md5码，且路径中需要替换md5,则替换。
        if(info && info.md5 && tmp.indexOf('{md5}') > -1) {
            tmp = tmp.replace('{md5}', info.md5);
        }

        //只有找到相关信息才采用更改后的
        if(info) p = tmp;

        p = replaceUrlMap(p, options.urlMaps);
        return p;
    }

    //处理css
    function parseCSS(file, options) {
        var buildInfo = cache.getCache();

        //gutil.log(gutil.colors.cyan('parseCSS:'), gutil.colors.green(file.path));

        var content = file.contents.toString();
        content = replaceCSSUrl(content, options, buildInfo, file.path);
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
            csscontent = replaceCSSUrl(csscontent, options, buildInfo, file.path);
            //gutil.log(gutil.colors.blue('inlineCSS:'), gutil.colors.green(filepath));
            return csscontent;
        });
    }

    //处理css中的url路径，或加上md5码
    function replaceCSSUrl(content, options, buildInfo, filepath) {
        var reg = /url\s*\(\s*([^\)]+?)\s*\)/ig;
        return content.replace(reg, function (s, p, i) {
            //对base64的图片直接返回，无需处理
            if (p.indexOf('data:image') > -1) return s;
            var tmp = p;
            //去除?之后面路径
            if(p.indexOf('?') > -1) tmp = p.substr(0, p.indexOf('?'));

            var fpath = path.normalize(path.join(options.dest, tmp));
            var spath = path.join(options.base, tmp);
            var info = buildInfo[fpath] || buildInfo[spath];   
            //相对于根发布路径
            if(!info && options.destPath) info = buildInfo[path.join(options.destPath, tmp)];

            //如果上面的都不可以，则有可能是相对路径，
            if(!info && filepath) {
                fpath = path.normalize(path.join(path.dirname(filepath), tmp));
                info = buildInfo[fpath];
            }
                
            //如果有md5则，合到路径中
            if(info && info.path) {
                tmp = path.dirname(tmp) + '/' + path.basename(info.path);
                //如果后续还有?部门，也截取到tmp中
                if(p.indexOf('?') > -1) {
                    tmp += p.substr(p.indexOf('?'));
                }
            }

            //如果有md5码，且路径中需要替换md5,则替换。
            if(info && info.md5 && tmp.indexOf('{md5}') > -1) {
                tmp = tmp.replace('{md5}', info.md5);
            }

            //替换映射部分
            tmp = replaceUrlMap(tmp, options.urlMaps);    
            s = s.replace(p, tmp);

            //gutil.log(gutil.colors.blue('css url:'), gutil.colors.green(s));
            return s;
        });
    }

    //把url中对应的部分替换成配置的映射
    function replaceUrlMap(url, maps) {
        if(url && maps && maps.length) {
            for(var i=0;i<maps.length;i++) {
                url = url.replace(maps[i].match, maps[i].target);
            }
        }
        return url;
    }
}