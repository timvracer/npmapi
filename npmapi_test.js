
assert = require("assert");
_ = require("underscore");
rewire = require("rewire");
npmapi = rewire("./npmapi.js");

//
// RUN TEST WITH THE FOLLOWING SHELL COMMAND
// NODE_ENV='test' mocha npmapi_test.js --reporter spec
//
// we will simulate the following directories from the reference directory
//
// projects_rootdir     projects 
// --- test_proj1          --- test_proj3
//     -- package.json       -- package.json
//     -- node_modules       -- node_modules
//        -- module1 
//          -- package.json
//          -- README.md
//          -- node_modules
//            -- module3
//              -- package.json
//        -- module2 
//        -- module4 
//              -- package.json
//
// --- test_proj2          --- test_proj4
//     -- node_modules       -- <empty>
//
// --- test_proj2.5
//     --- package.json 

// This is the simulated npmlpb.json file
var SIM_JSON = {"projects_rootdir" : "./projects_rootdir/", 
				"projects" : [	{"name" : "test3", "path": "projects/test_proj3"},{"name" : "test4", "path": "projects/test_proj4"}]
			   };

var SIM_PJSON_PROJ1 = {
	"name" : "test_proj1",
	"version" : "0.0.0",
	"license" : "MIT",
	"dependencies": {
		"module1" : "0.0.0",     
		"extra_module" : "0.0.0" 
	},
	"devDependencies" : {
		"extra_dev_module" : "0.0.0"
	},
	"readme" : "This is the readme for proj1",
	"readmeFilename" : "README.md"
}
var SIM_PJSON_MOD3 = {
	"name" : "module3",
	"version" : "0.0.0",
	"licenses" : ["MIT"],
	"dependencies": {
	},    
	"readme" : "This is the readme",
}
var SIM_PJSON_MOD4 = {
	"name" : "module4",
	"version" : "0.0.0",
	"licenses" : {"type" : "MIT"},
	"dependencies": {
	},    
	"readme" : "This is the readme",
}
var SIM_PJSON_MOD1 = {
	"name" : "module1",
	"version" : "0.0.0",
	"license" : [{ "type" : "MIT", "url" : "http://urltolicense.com"}],
	"dependencies": {
		"extra_module": "^0.0.0",
	    "extra_module_git": "git+https://gitlab.ask.com/archie/local-package-browser.git"
	},
	"devDependencies" : {
		"module3" : "^0.0.0"
	},
	"readmeFilename" : "README.md"
}

var simulatedJsonfile = {

	readFile: function (path, cb) {
		if (path=="./npmlpb.json") {
			cb(null, SIM_JSON);
			return;
		}

		var retObj = SIM_PJSON_MOD3;

		if (path=="./projects_rootdir/test_proj1/package.json") {
			retObj = SIM_PJSON_PROJ1;
		}
		if (path=="./projects_rootdir/test_proj1/node_modules/module1/package.json") {
			retObj = SIM_PJSON_MOD1;
		}
		if (path=="./projects_rootdir/test_proj1/node_modules/module4/package.json") {
			retObj = SIM_PJSON_MOD4;
		}
		cb(null, retObj);
	}
}

function xsts (obj) {
	return (obj != null && obj != undefined);
}

var simulatedFs = {


		exists: function(path, cb) {
			cb (this.existsSync(path));
			return;
		},

        readdir: function (path, cb) {
			if (path==="./projects_rootdir/") {
				cb (null, ["test_proj1", "test_proj2", "test_proj2.5"]);
				return;
			}
			if (path==="./projects_rootdir/test_proj1/node_modules/") {
				cb (null, ["module1", "module2", "module4"]);
				return;
			}
			if (path==="./projects_rootdir/test_proj1/node_modules/module1/node_modules/") {
				cb (null, ["module3"]);
				return;
			}
			cb ("directory not found", null);
        },

        readFile: function(path, encoding, cb) {
			if (path=="./projects_rootdir/test_proj1/node_modules/module1/README.md") {
				cb(null, "Readme file with **showdown** markup");
				return;
			}
			if(path=="./projects_rootdir/test_proj1/README.md") {
				cb(null, "TEST PROJ 1 README file with **showdown** markup");
				return;
			}
			cb(path + ": file not found", null);
			return;
        },

        existsSync: function (path) {
        	if (path=="./projects_rootdir/test_proj1/package.json" ||
        		path=="./npmlpb.json" ||
        		path=="./projects_rootdir/test_proj1/node_modules" ||
        		path=="./projects/test_proj2.5/package.json" ||
        		path=="./projects/test_proj2/node_modules" ||
        		path=="./projects/test_proj3/package.json" ||
        		path=="./projects/test_proj3/node_modules" ||
				path=="./projects_rootdir/test_proj1/node_modules/module4/package.json" ||
				path=="./projects_rootdir/test_proj1/node_modules/module1/package.json" ||
				path=="./projects_rootdir/test_proj1/README.md" ||
				path=="./projects_rootdir/test_proj1/node_modules/module1/README.md" ||
				path=="./projects_rootdir/test_proj1/node_modules/module1/node_modules/" ||
				path=="./projects_rootdir/test_proj1/node_modules/module1/node_modules/module3/package.json") {

        		return true;
        	}
        	return false;
        }
}

npmapi.__set__("fs", simulatedFs);
npmapi.__set__("jsonfile", simulatedJsonfile);

describe("npmAPI tests", function() {

	describe("test helper function findNameInObjectArray", function() {
		var testArray = [{"name" : "mod1", "version" : "0.0.0"},
						{"name" : "mod2", "version" : "0.0.1"},
						{"name" : "mod3", "version" : "0.0.1"},
						{"name" : "mod4", "version" : "0.0.1"}];

		it("should return the index of the item if the property is in the array", function() {
			assert.equal(2, npmapi.findNameInObjectArray(testArray, "mod3"));
		});
		it("should fail if the property is not in the array", function() {
			assert.equal(-1, npmapi.findNameInObjectArray(testArray, "not_there"));
		});
	});
	describe("test helper function propInObject", function() {
		var testObj = {"mod1" : "0.0.0", "mod2" : "0.0.0"}; 

		it("should succeed if the property is in the object", function() {
			assert(npmapi.propInObject(testObj, "mod1"));
		});
		it("should fail if the property is not in the object", function() {
			assert.equal(false, npmapi.propInObject(testObj, "not_there"));
		});
	});
	describe("test helper function mergeDependencies", function() {
		// simulates the directory tree ( 3 installed packages )
		var testObj = [{"name" : "mod1", "version" : "0.0.1"},   // from primary
						{"name" : "mod2", "version" : "0.0.2"},   // orphaned
						{"name" : "mod3", "version" : "0.0.3"}]  // from dev
		// simulates package.json 
		var testObj2 = {"dependencies": {"mod1" : "0.0.1", "mod4" : "0.0.4"},   // mod1 and mod4 are primary dependencies, mod4 not installed
			 			"devDependencies": {"mod3" : "0.0.3", "mod5" : "0.0.5"}};  // mod3 and mod5 are devDependences, mod5 not installed
			 																	 // mod2 installed, but not referenced... orphaned
		// merged object should look like this, note that module2 is orphaned
		var compObj = [{"name" : "mod1", "version" : "0.0.1", "depSource" : "primary"}, 
						{"name" : "mod2", "version" : "0.0.2", "depSource" : "orphaned"},
						{"name" : "mod3", "version" : "0.0.3", "depSource" : "dev"},
						{"name" : "mod5", "version" : "0.0.5", "license" : [], "notInstalled" : true, "depSource" : "dev"},
						{"name" : "mod4", "version" : "0.0.4", "license" : [],  "notInstalled" : true, "depSource" : "primary"}
						];

		it("should merge unique properties of 2 objects", function() {
			var resObj = npmapi.mergeDependencies(testObj, testObj2);
			assert.equal(JSON.stringify(resObj), JSON.stringify(compObj));
		});
	});
	describe("rewire config file actually works", function() {
		it("should return SIM_JSON value", function(done) {
			npmapi.readConfigFile(function(err, obj) {
				if (err) throw err;
				assert.equal(SIM_JSON, obj);
				done();
			});	
		});
	});
	describe("test helper function getLicenseArray", function() {
		it("should return a single license string", function(done) {
			var res = npmapi.getLicenseArray (SIM_PJSON_PROJ1);
			assert.equal(JSON.stringify(res), JSON.stringify(["MIT"]));
			done();
		});
		it("should return a single license string in an array", function(done) {
			res = npmapi.getLicenseArray (SIM_PJSON_MOD3);
			assert.equal(JSON.stringify(res), JSON.stringify(["MIT"]));
			done();
		});	
		it("should return a license within a single object", function(done) {
			res = npmapi.getLicenseArray (SIM_PJSON_MOD4);
			assert.equal(JSON.stringify(res), JSON.stringify(["MIT"]));
			done();
		});
		it("should return a license within an array of objects", function(done) {
			res = npmapi.getLicenseArray (SIM_PJSON_MOD1);
			assert.equal(JSON.stringify(res), JSON.stringify(["MIT"]));
			done();
		});
	});

	npmapi.initConfig(function(err, projects) {
		if (err) throw err;

		describe("init Config", function() {
			it("should return valid projects from root_dir, and all projects specifically listed", function(done) {
				assert.equal(projects.length, 3);
				done();
			});
			it("should return only directory with both node_modules and package.json from root", function(done) {
				// 
				var projObjs = _.filter(projects, function(rec){return (rec.path.search('projects_rootdir') != -1)});
				assert.notEqual(projObjs, null);
				assert.equal(projObjs.length, 1);
				assert.equal(projObjs[0].path, "./projects_rootdir/test_proj1/");
				done();
			});
			it("should assign MD5 id's to all projects", function(done) {
				var projObjs = _.filter(projects, function(rec){return (xsts(rec.uid)) });
				assert.equal(projObjs.length, projects.length);
				done()
			});
		});
		describe("map Pid to Object", function(){
			it("should return the proper record given valid uid", function(done){
				if (err) throw err;
				var uid = projects[2].uid;
				var obj = npmapi.mapPidToObject(uid);
				assert.equal(obj, projects[2]);
				done();
			});
			it("should return the default record if given an invalid uid", function(done){
				if (err) throw err;
				var obj = npmapi.mapPidToObject(-1);
				assert.equal(obj, projects[0]);
				obj = npmapi.mapPidToObject(99);
				assert.equal(obj, projects[0]);
				done();
			});
		});
	
		describe.only("getModuleList", function(){
			var projObjs = _.filter(projects, function(rec){return (rec.path.search('projects_rootdir') != -1)});
			npmapi.getModuleList (projObjs[0].uid, function(err, modList) {

				it("should return an object for the pid given", function(done) {
  					// this will get the uid of test_proj1 for the test
					assert.equal(modList.name, "test_proj1");
					done();
				});

				it("should return package.json and README.md for the module", function(done) {

					assert.equal(modList.packageJson, SIM_PJSON_PROJ1);
					assert.equal(modList.packageJson.readme, "<p>TEST PROJ 1 README file with <strong>showdown</strong> markup</p>");
					done();
				});
				it ("should return the license for the modules and their dependencies", function(done) {
					assert.equal(JSON.stringify(modList.license), JSON.stringify(["MIT"]));
					assert.equal(JSON.stringify(modList.dependencies[1].license), JSON.stringify(["MIT"]));
					done();
				});

				it("should return all elements of the dependency tree", function(done) {
					assert.equal(modList.dependencies.length, 4);
					assert.equal(modList.dependencies[0].name, "module1");
					assert.equal(modList.dependencies[2].name, "extra_dev_module");
					assert.equal(modList.dependencies[0].dependencies[0].name, "module3");
					done();
				});
				it("should properly identify the installed primary depenencies", function(done) {
					assert.equal(modList.dependencies[0].depSource, "primary");
					done();
				});
				it("should properly identify the installed dev depenencies", function(done) {
					assert.equal(modList.dependencies[0].dependencies[0].depSource, "dev");
					done();
				});
				it("should properly identify uninstalled ependencies", function(done) {
					// ensure uninstalled dependencies are identified
					assert.equal(modList.dependencies[2].notInstalled, true);
					assert.equal(modList.dependencies[2].depSource, "dev");
					done();
				});
				it("should identify orphaned modules", function(done) {

					// ensure that the module that is NOT in package.json is correctly marked
					assert.equal(modList.dependencies[1].depSource, "orphaned");
					// ensure that dev modules are correctly marked
					// ensure that the directory that is not in package.json, but exists with a package.json
					// gets enumerated (orphan)
					assert.equal(modList.dependencies[1].name, "module4");
					done();
				});	
			});	
		});	

		describe("getNpmInfo", function() {

			it ("should retrieve from the local filesystem with included readme info, and prioritize modpath over npminfo", function(done) {
				var projObjs = _.filter(projects, function(rec){return (rec.path.search('projects_rootdir') != -1)});
				var uid = projObjs[0].uid;
				var qobj = {"pid" : uid, "modpath" : "module1@0.0.0|module3@0.0.0", "npminfo" : "module2@0.0.0"};

				npmapi.getNpmInfo (qobj, function(err, obj) {
					if (err) throw err;
					assert.equal(obj.name, "module3");
					assert.equal(obj.readme, "<p>This is the readme</p>");
					done();
				});
			});	

			it("should retrieve from npmjs.org if only npmmod is specified, and retrieve README info", function(done) {
				var qobj = {"npmmod" : "async@0.9.0"};
				npmapi.getNpmInfo (qobj, function(err, obj) {
					if (err) throw err;
					assert.equal (obj.name, "async (info retrieved from npmjs.org)");
					// could not retreive actual readme via npm api (which sucks)
					//assert.equal ((obj.readme != undefined), true);
					done();
				});
			});


			it ("should retrieve from the local filesystem and insert README when specified", function(done2) {
				
				var projObjs = _.filter(projects, function(rec){return (rec.path.search('projects_rootdir') != -1)});

				var uid = projObjs[0].uid;
				var qobj = {"pid" : uid, "modpath" : "module1@0.0.0"};

				npmapi.getNpmInfo (qobj, function(err, obj) {
					if (err) throw err;
					assert.equal(obj.name, "module1");
					assert.equal(obj.readme, "<p>Readme file with <strong>showdown</strong> markup</p>");
					done2();
				});
			});	
		});
	});
});


