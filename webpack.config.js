var walk = require("walkdir");
var p = require("path");
var copyDir = require("copy-dir");
var fs = require("fs");
var _ = require("lodash");
var fileMd5 = require('file-md5');
var crypto = require('crypto');

var Webpack = require("webpack");
var HtmlWebpackPlugin = require("html-webpack-plugin");

var domain = require("./config.js").domain;

var oldConfig;	// 避免-w模式下死循环编译问题

var plugins = [
	new Webpack.BannerPlugin("by kazaff"),
	function(){
		this.plugin("compile", function(params){
			console.log("编译初始化");
			//拷贝modules中所有文件到build中
			copyDir.sync("./modules", "./build/modules", function(stat, path, file){
				var iWant = true;
				if(stat === "file" && p.basename(path) === "config.js"){
					iWant = false;
				}else if(stat === "file"){
					try{
						fs.statSync("./build/"+path);
						iWant = false;
					}catch(e){}
				}
				return iWant;
			});

			//拷贝assets文件夹到build中
			copyDir.sync("./assets", "./build/assets");

			//获取当前所有需要处理的config文件位置
			var paths  = [];
			walk.sync("./modules/", function(path, stat){
				if(p.basename(path) === "config.js"){
					paths.push(path);
				}
			});

			//检查是不是每个模块都有配置文件
			var moduleCount = 0;
			walk.sync("./modules/", {no_recurse: true}, function(path, stat){
				var stat = fs.statSync(path);
				if(stat.isDirectory()){
					moduleCount++;
				}
			});
			if(moduleCount !== paths.length){
				throw "模块数和config数不一致";
			}

			//合并所有发现的config.js
			var configs = [];
			_(paths).forEach(function(path){
				delete require.cache[path];	//清除缓存
				configs.push(require(path));
			});
			configs = _.flatten(configs);
			//console.log(configs);

			//检查配置文件中，link_id是否存在冲突
			var tmpConfigs = _.uniqBy(configs, "link_id");
			if(configs.length !== tmpConfigs.length){
				var conflictConfigs = _.differenceWith(configs, tmpConfigs, _.isEqual);
				console.log("∨∨∨∨∨∨∨∨∨∨∨∨∨∨");
				console.error(conflictConfigs);	//todo 未知原因导致这里输出两次，怀疑是webpack处理异常机制导致
				console.log("∧∧∧∧∧∧∧∧∧∧∧∧∧∧");
				throw "项目配置文件中link_id存在冲突";
			}
			tmpConfigs = null;

			// 让init.js文件的修改也影响html文件签名，该逻辑用来针对：html内容没变，但anther.js文件更改的场景
			var initFileMD5 = fileMd5('./init.js');	// 当前的版本的文件签名

			// 让各个模块config.js文件的修改也影响html文件签名，该逻辑用来针对：html内容没变，但config.js文件更改的场景
			// 但由于html的签名内容也会影响config.js文件改变，所以形成了一个环形依赖
			// 为了打破这个环形依赖，我们其实只需要根据纯config的内容来生成签名即可
			var configFileMD5 = crypto.createHash('md5').update(JSON.stringify(configs)).digest("hex");

			//htmlMd5计算html文件签名的时机
			var htmlMd5Router = {};
			walk.sync("./modules/", function(path, stat){
				if(p.extname(path) === ".html"){
					var key = p.relative(p.resolve("./modules/"), path);
					if(p.sep === "\\"){
						key = key.replace(/\\/g, '/');
					}

					// 为了避免签名太长，合并三方签名
					htmlMd5Router[key] = crypto.createHash('md5').update(fileMd5(path) + initFileMD5 + configFileMD5).digest("hex");
				}
			});

			//htmlMd5二次处理config内容的时机
			_(htmlMd5Router).forEach(function(md5, html){
				_(configs).forEach(function(target){
					if(target.link_url && target.link_url.indexOf(domain+html) === 0){
						if(target.link_url.indexOf('?')>=0){
							target.link_url += '&v='+md5+"&";
						}else{
							target.link_url += '?v='+md5+"&";
						}
					}
				});
			});

			//根据内容生成总config.js
			var jsonConfigs = JSON.stringify(configs)
			if(oldConfig !== jsonConfigs){	// 避免-w模式下死循环编译问题
				fs.writeFileSync("./tmp/config.js", "module.exports="+JSON.stringify(configs));
				oldConfig = jsonConfigs;
			}

			return true;
		});
	},
	function(){
		this.plugin("done", function(stats){
			//清理工作
			//fs.unlinkSync("./tmp/config.js");
			walk.sync("./build/", {no_recurse: true}, function(path, stat){
				if(_.startsWith(p.basename(path), "TempConfig-")){
					fs.unlinkSync(path);
				}
			});
		});
	},
	new Webpack.WatchIgnorePlugin([
		p.resolve(__dirname, './build/'),
	]),
	new HtmlWebpackPlugin({
		filename: "index.html",
		template: "./index.html",
		excludeChunks: ['TempConfig']	// 排除根文件夹中的config.js文件
	})
];

//自动将编译好的boot文件注入到所有模块的html文件中
paths  = [];
configs = [];
walk.sync("./modules/", function(path, stat){
	if(p.extname(path) === ".html"){
		paths.push(path);
	}else if(p.basename(path) === "config.js"){
		configs.push(path);
	}
});

_(paths).forEach(function(path){
	plugins.push(new HtmlWebpackPlugin({
		filename: p.relative(p.resolve("."), path),
		template: path,
		excludeChunks: ['TempConfig']	// 排除每个模块文件夹中的config.js文件
	}));
});

module.exports = {
	entry: {
		Boot: './boot.js',
		TempConfig: configs,
		Another: './init.js',
	},
	output: {
		path: "build",
		filename: "[name]-[chunkhash].js"
	},
	module:{
		loaders: [
			{
				test: /\.js$/,
				loader: "babel?presets[]=es2015,plugins[]=transform-runtime",
				exclude: [/node_modules/]
			}
		]
	},
	resolve: {
		extensions: ['', '.js']
	},
	plugins: plugins
};
