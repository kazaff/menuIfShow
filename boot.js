var initConfig = require("./tmp/config.js");	//加载配置文件

;(function($){
	var finalConfig = [];	//表示根据用户权限配置处理过的config
	var configState = false;	//是否处理过config
	var callerWant = {};	//用户自定义配置参数

	var getSonMenus = function(menuConfigs, topMenuId){
		return _.orderBy(_.filter(menuConfigs, {isDir: false, dir_id: topMenuId}), ["order"], ["asc"]);
	};

	/*
	 * 初始化realConfig，代表前端系统已经得到当前登录用户的权限配置
	 * options:
	 *  {
	 *		debug: bool，表示是否无视缓存重新初始化所有数据，默认为false，可用于用户重新登录
	 *		node: jquery对象，表示主菜单dom，例如：$("#menu")
	 *		handleHtml: func(topMenus, sonMenus function(topMenuId))，用来创建menu html string，例如： function(data)，参数data代表finalConfig
	 *    userToken: func，用来获取当前登录用户的sessionid
	 *		restApi: func，用来设置需要请求的后端服务地址
	 *		fetch: func，用来发送ajax请求的方法，返回一个jq ajax Promise对象
	 *		handleError:	func(status, error)，用来处理ajax异常
	 *	}
	*/
	var init = function(options, callback){
		console.log("init");

		//默认参数
		callerWant = $.extend({}, {
			debug: false,
			userToken: function(){
					return sessionStorage.getItem("token");
			},
			restApi: function(){
				return "../mock/myAcl.json";
			},
			fetch: function(){
				return $.ajax({
					url: callerWant.restApi(),
					method: "GET",
					headers: {
							"AUTH": " " + callerWant.userToken()
					},
					dataType: "json",
					crossDomain: true,
					timeout: 5000,
				});
			},
			handleError: function(status, err){
				console.error(status, err);
			},
		}, options);

		//检查sessionStorage中是否已经存在menuHtml
		var menuHtml = callerWant.debug?null:sessionStorage.getItem("menuHtml");
		if(menuHtml !== null){
			//直接使用缓存数据
			callerWant.node.html(menuHtml);
			callback();
			return;

		}else{
			console.log("开始生成menuHtml");

			//处理finalConfig
			//检查sessionStorage中是否已经存在finalConfig
			finalConfig = callerWant.debug?null:JSON.parse(sessionStorage.getItem("finalConfig"));
			if(finalConfig !== null){//直接使用缓存数据
				//使用调用者提供的生成菜单html函数来生成menu html string
				menuHtml = callerWant.handleHtml(_.orderBy(_.filter(_.clone(finalConfig), {isDir: true}), ["order"], ["asc"]), _.curry(getSonMenus)(_.clone(finalConfig)));
				sessionStorage.setItem("menuHtml", menuHtml);	//缓存生成的menu html string
				callerWant.node.html(menuHtml);		//将html塞入指定的dom中
				configState = true;	//表明初始化完毕
				callback();
				return;

			}else{
				console.log("开始生成finalConfig");

				finalConfig = initConfig;

				callerWant.fetch().done(function(data){
					console.log("成功获取用户权限配置");

					_(data).forEach(function(setting){
						_(finalConfig).forEach(function(row){
							if(row.service_id === setting.pid){
								row.status = setting.status;
							}
						});
					});

					//缓存得到的用户权限菜单配置
					sessionStorage.setItem("finalConfig", JSON.stringify(finalConfig));
					//使用调用者提供的生成菜单html函数来生成menu html string
					menuHtml = callerWant.handleHtml(_.orderBy(_.filter(_.clone(finalConfig), {isDir: true}), ["order"], ["asc"]), _.curry(getSonMenus)(_.clone(finalConfig)));
					sessionStorage.setItem("menuHtml", menuHtml);	//缓存生成的menu html string
					callerWant.node.html(menuHtml);	//将html塞入指定的dom中
					configState = true;	//表明初始化完毕
					callback();
					return;

				}).fail(function(xhr, status, error){
					callerWant.handleError(status, error);
				});
			}
		}

	}

	/*
	 *自定义menu插件
	 *
	 *该jq插件功能包含：
	 * -. 根据给定操作编号，返回操作对应的json数据
	 * -. 根据地址栏url来返回对应的菜单项json数据
	 * -. 重新构建menuHtml
	*/
	$.fwMenu = function(options, ready){
		init(options, function(){
			console.log("init comlpated!");
			ready(this);
		}.bind(this));
	};

	//根据给定操作编号，返回操作对应的json数据，用于非菜单的情况下获取操作链接信息（例如按钮）
	$.fwMenu.prototype.getLinkById = function(id){
			console.log("getLinkById");

			if(!configState)
				throw "未初始化完毕";

			return _.clone(_.filter(finalConfig, {link_id: id})[0]);
	};

	//根据地址栏url来返回对应的菜单项json数据，用于根据地址栏来控制对应菜单项的显示状态（例如展开，高亮等）
	$.fwMenu.prototype.getLinkByAddress = function(){
		console.log("getLinkByUrl");

		if(!configState)
			throw "未初始化完毕";

		var link_url = window.location.protocol+"//"+window.location.host+(window.location.port===80?"80":window.location.port)+window.location.pathname;
		console.log(link_url);
		if(!_.endsWith(link_url, ".html")){
			link_url += "index.html";
		}

		return _.clone(_.filter(finalConfig, {link_url: link_url})[0]);
	};

	//重新构建menuHtml，根据handle处理函数重新生成menuHtml（用于多语言切换等场景）
	$.fwMenu.prototype.rebuildMenu = function(handle){
		console.log("rebuildMenu");

		if(!configState)
			throw "未初始化完毕";

		var menuHtml = handle(_.orderBy(_.filter(_.clone(finalConfig), {isDir: true}), ["order"], ["asc"]), _.curry(getSonMenus)(_.clone(finalConfig)));
		sessionStorage.setItem("menuHtml", menuHtml);
		callerWant.node.html(menuHtml);
	};

})(jQuery);
