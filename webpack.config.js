var walk = require("walkdir");
var p = require("path");
var copyDir = require("copy-dir");
var fs = require("fs");
var _ = require("lodash");
var fileMd5 = require('file-md5');

var Webpack = require("webpack");
var HtmlWebpackPlugin = require("html-webpack-plugin");

var domain = require("./config.js").domain;

var oldConfig;

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

			//htmlMd5计算html文件签名的时机
			var htmlMd5Router = {};
			walk.sync("./modules/", function(path, stat){
				if(p.extname(path) === ".html"){
					var key = p.relative(p.resolve("./modules/"), path);
					if(p.sep === "\\"){
						key = key.replace(/\\/g, '/');
					}
					htmlMd5Router[key] = fileMd5(path);
				}
			});

			//htmlMd5二次处理config内容的时机
			_(htmlMd5Router).forEach(function(md5, html){
				var index = _.findIndex(configs, {"link_url": domain+html});
				if(index>0){
					configs[index].link_url = domain+html+'?v='+md5+"&";
				}
			});

			//根据内容生成总config.js
			var jsonConfigs = JSON.stringify(configs)
			if(oldConfig !== jsonConfigs){
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
		excludeChunks: ['TempConfig']
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
		excludeChunks: ['TempConfig']
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
}
