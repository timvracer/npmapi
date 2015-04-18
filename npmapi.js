"use strict";
//
// Local NPM Registry API
//
// This module allows you to inspect projects on the local filesystem (local to this server).  It's primary usage would be for
// admin tools, and inspection of the local repository.  Much of what this does is equivalent to npm ls, but I found that the
// npm API is clunky and awkward to use across multiple project directories.
//
// 
//
//-------EXPORTS--------------------------------------------------------------------------
//
// getModuleList will return a JSON object of the dependencies tree with name/version
//
// getNpmInfo has 2 possible request paramaters.  If only 'npmmod' is specified, it is assumed to be
// module@version, and the API will look up the information from the npm registry via "view"
// if modpath is specified, it will take priority.  It is a full path in the form 
// of module@ver|module@ver|module@ver... to the specific package.json you want in the dependency tree.
//
// getProjectList returns an array of all enumerated projects that are found based on settings
// in npmlpb.json config file in the project directory.  pid refers to the project ID that
// is assigned when npmlpb.json is first processed, and is included in the return structure
// of getModuleList
//
// getModuleList(pid, function(err, projListObj) {})
//
// getNpmInfo(queryObject, function(err, infoObj){})
//
// getProjectList(function(err, projectArray){})
// 


var npm = require('npm');
var showdown = require ('showdown');
var _ = require('underscore');
var fs = require('fs');
var jsonfile = require('jsonfile');
var util = require('util');
var async = require('async');
var MD5 = require('MD5');


//---------------------------------------------------------------------------------
// INIT FUNCTIONS - BOOTSTRAPPING
//

var LOGGER = null;
setLogger(function(msg) {console.log(msg)});

var CONFIG_OBJ = {};  // cache to hold the current projects list, defined by npmlpb.json

// So we can rewire the module, we call this directly from the test to initialize the module (not on load)
//
if (process.env.NODE_ENV != "test") {
	initConfig(function(err, obj){
		if (err) {
			logger(err);
			process.exit(1);
		}
	});
}
// helper function - to copy the coffee script existenstial operator
function exists(a) {return (a!==undefined && a!==null)}

function readConfigFile(cb) {

	fs.exists("./npmlpb.json", function(doesExist) {
		if (doesExist) {
			jsonfile.readFile("./npmlpb.json", function(err, obj) {
				if (err) {
					process.nextTick(function(){cb("error reading npmlpb.json", null)});
				} else {
					process.nextTick(function(){cb(null, obj)});
				}	
			});	
		} else {
			process.nextTick(function(){cb("npmlpb.json does not exist", null)});
		}
	});
}

//---------------------------------------------------------------------------------
// logging funciton
//
function logger(msg) {
	if (exists(LOGGER)) {
		LOGGER(msg);
	} else {
		console.log (msg);
	}	
}
//---------------------------------------------------------------------------------
// configure logger
//
function setLogger(cb) {
	LOGGER = cb;
}

//---------------------------------------------------------------------------------
// read the config file and read projects in specified root directory
// This is exported, so that a client may call this to force a refresh of the project list
// Projects directories are defined by npmlpb.json in the server root directory
// returns the projects object to the callback if successful
//
function initConfig(cb) {

	readConfigFile(function(err, dataObj) {
		if (err) {
			CONFIG_OBJ = {};
			process.nextTick(function(){cb("error reading npmlpb.json", null)});
		} else {
			CONFIG_OBJ = dataObj;
			getProjectListFromRoot(CONFIG_OBJ, function(err) {
				if (err) {
					process.nextTick(function(){cb(err, null)});
				} else {
					assignIds(CONFIG_OBJ);
					process.nextTick(function(){cb(null, CONFIG_OBJ.projects)});
				}	
			});
		}	
	});
}

// Assign unique ID's to every entry in the config table, this is how the client requests
// information for any particular project.  We use MD5 to ensure consistency across ID's as
// ordering can change when projects are added or deleted.  This ensures consistency with the
// client/caller
//
function assignIds(configObj) {
	var projArr, uid;
	// Assign UID's to each project entry
	projArr = configObj.projects;
	// add an ID to any pre configured projects
	//
	for (uid=0; uid < projArr.length; uid++) {
		projArr[uid].uid = MD5(projArr[uid].path);
	}
}


function getProjectList(cb) {
	process.nextTick(function(){cb(null, CONFIG_OBJ.projects)});
}

//---------------------------------------------------------------------------------
// based on the configuration object passed in, fill out the project list in this object
// based on the root project directory. Adds projects to the project list object

function getProjectListFromRoot(configObj, cb) {

	// get a directory listing from the root directory provided.  For each directory,
	// check for the existence of a package.json AND a node_modules directory.  If both
	// exist, add the directory to the project list

	fs.readdir(configObj.projects_rootdir, function(err, fileArr) {
		var projArr;

		if (!exists(err)) {	
			if (fileArr && fileArr.length > 0) {

				projArr = configObj.projects;
				if (!exists(projArr)) {
					projArr = [];
				}	
				_.reduce(fileArr, function(memo, num){
						var fp;
						fp = configObj.projects_rootdir + num;
						// must use Sync inside underscore, don't love this, may refactor later w/o  using _reduce
						//
						if (fs.existsSync(fp+"/node_modules") && fs.existsSync(fp+"/package.json")) {
							projArr.push({"name" : num, "path" : configObj.projects_rootdir + num + "/"}) 
						}
					},
					projArr);
				process.nextTick(function(){cb(null)});
				return;
			}
		}
		process.nextTick(function(){cb("Error processing npmlpb.json projects_rootdir")});
	});		
}

//---------------------------------------------------------------------------------
// Given any pid, will return the appropriate project object. Will ALWAYS return
// a valid object, returning the default object when necessary
//
function mapPidToObject(pid) {

	var projObj = {};

	if (pid === null || pid < 0 || pid > CONFIG_OBJ.projects.length) {
		pid = 0;
	}
	projObj = _.find(CONFIG_OBJ.projects, function(rec){return (rec.uid === pid)});
	if (!exists(projObj)) {
		projObj = CONFIG_OBJ.projects[0];
	}
	return projObj;
}


//---------------------------------------------------------------------------------
// Get the list of dependencies for the project specified by pid
// puts the information about the project in the root of the object, and then
// builds out a recursive dependency tree from the root object calling
// the recursive function processDTree
//
function getModuleList(pid, cb) {

	var projObj, 
		projPath, 
		packageJson;
	var resp = {};

	// Get the proper project record that matches the pid
	// Only allow access to configured projects in npmlpb.json
	//
	if (!exists(CONFIG_OBJ.projects) && CONFIG_OBJ.projects.length > 0) {
		process.nextTick(function() {cb("There are no projects configured", null);});
		return;
	}

	// This will always return a valid object, validates pid, returns default object if invalid
	projObj = mapPidToObject(pid);

	logger ("Loading Module List for project index:" + pid);


	// in order to build the dependency tree recursively
	// from the project path, we dive into node_modules, and we inspect each subdirectory.  If it includes a package.json
	// we retrieve the relevant info, create a record, and then dive in
	//projPath = "./" + projObj.path;
	projPath = projObj.path;

	// First get information about the root project
	jsonfile.readFile(projPath+'package.json', function(err, packageJson) {
	
		if (err) {
			process.nextTick(function(){cb (err, null)});
			return;
		}

		if (exists(packageJson)) {
			// fill in the README
			processPJsonReadme (projPath, packageJson, function() {

				resp.packageJson = packageJson;
				resp.name = packageJson.name;
				resp.version = packageJson.version;
				resp.license = getLicenseArray(packageJson);
				processDTree (projPath, function(err, results) {
					if (exists(results)) {
						resp.dependencies = mergeDependencies(results, packageJson); //results;
					}
					process.nextTick(function(){cb (err, resp)});
					return;
				});	
			});	
		} else {
			process.nextTick(function(){cb({error: "ERROR could not find package.json in " + projPath}, null)});
			return;
		}
	});	
}

//---------------------------------------------------------------------------------------
// for a given path that represents a possible project or dependency sub-directory, look 
// for a node_modules directory, and for every sub-directory in node_modules, retrieven
// it's dependency trees.  Processeed asyncronously, calls back when the entire dependency
// chain for the given path has been processed

function processDTree(path, cb) {

	var dirArry, 
		fullPathDirArry;
	var pjpath = path + 'node_modules/';

	// get the directory contents, bail if there is an error
	fs.readdir(pjpath, function(err, dirArry) {

		if (exists(err)) {
			//process.nextTick(function() {cb({'error' : "Cannot read directory " + pjpath}, null)});
			process.nextTick(function() {cb(null, [])});
			return;
		} 

		// convert dirArry into an array of objects that
		// have the members 'fullpath' and 'dirName'
		fullPathDirArry = _.map(dirArry, function(dirName) {
			return ({'fullpath' : pjpath + dirName + '/', 'dirName' : dirName});
		});

		// for each directory entry that has a legit package.json, we create an object and add
		// it to depObj, whose object name/key is the name of the directory, and object contents
		// includes name/version and a recursive dependencies tree.  If the directory array is
		// empty (no node_modules directory) then we just add the package.json dependencies
		async.map (fullPathDirArry, getDepObject, function (err, results) {
			// remove any null results
			var filteredResults = _.filter(results, function(obj){ return (obj !== null) });
			process.nextTick(function() {cb(err, filteredResults)});
			return;
		});
	});	
}

// Create a depenency object (depObj) for the given directory object which contains a fullpath, and a single directory name
// This function sets up the object and recusively calls ProcessDTree for each sub directory.  If there are sub directories under
// that, it will subsequently call into those recursively as well
function getDepObject(dirObj, cb) {

	var newPJPath = dirObj.fullpath + 'package.json';
	var depObj = {};
	var packageJson;

	// new PJPath is the full path to the package.json file in this directory (if it exists)
	fs.exists(newPJPath, function(doesExist) {

		// if it does not exist, we return null indicating this is not a valid dependency directory, and thus
		// has no depenency object
		if (!doesExist) {
			process.nextTick(function(){cb(null,null)});
			return;
		}

		// Read the package.json file to get the information for this depenency object
		jsonfile.readFile(newPJPath, function(err, packageJson) {

			// if the read fails, return null and ignore this directory
			if (exists(err)) {
				process.nextTick(function(){cb("no package.json, not a module",null)});
				return;
			} else {	

				// set up the object representing this packaage, and search into
				// it to see if it has dependencies of it's own
				depObj.name = packageJson.name;
				depObj.version = packageJson.version;
				depObj.license = getLicenseArray (packageJson);

				// if this directory also has a node_modules directory, we search into it recusively
				fs.exists(dirObj.fullpath+"node_modules/", function(doesExist) {
					if (doesExist) {
						// there is a node_modules directory, traverse it
						processDTree(dirObj.fullpath, function(err, results){

							// add dependencies from package.json that are not overlapping
							var mergeResults = mergeDependencies(results, packageJson);
							depObj.dependencies = mergeResults;
							process.nextTick(function(){cb(null, depObj)});
							return;
						});
					} else {
						// if there is not a node_modules directory, this is then a leaf node and a termination case
						// for the recursion.  Return the value of depObj
						depObj.dependencies = mergeDependencies([], packageJson);
						process.nextTick(function(){cb(null, depObj)});
						return;
					}	
				});	
			} 
		});		
	}); 
}

// merge non duplicate items from dep2 into dep1
function mergeDependencies(depArray, pjson) {

	var dobj = pjson.dependencies || {};
	var ddobj = pjson.devDependencies || {};
	var index;

	// first check whether all the modules specified in package.json are actually reflected in
	// the directory tree.  If not, add the non-installed entries to the array

	// first check devDependencies, find entries in p.json that are not in the directory tree
	for(var modName in ddobj) {

		index = findNameInObjectArray(depArray, modName);
		if (index < 0) {
			depArray.push({"name" : modName, "version" : ddobj[modName], "license" : [], "notInstalled" : true, "depSource" : "dev"});
		} else {
			depArray[index].depSource = "dev";
		}
	}
	// now check primary dependencies list, and again find modules specified not in the tree
	for(var modName in dobj) {
		index = findNameInObjectArray(depArray, modName);
		if (index < 0) {
			depArray.push({"name" : modName, "version" : dobj[modName], "license" : [], "notInstalled" : true, "depSource" : "primary"});
		} else {
			depArray[index].depSource = "primary";
		}
	}

		
	// now we need to check every item in the depArray and see if it has a package.json entry
	// if not, we mark it as orphaned
	if (exists(depArray)) {
		for (var i=0; i<depArray.length; i++) {
			if (!propInObject(dobj, depArray[i].name) && !propInObject(ddobj, depArray[i].name)) {
				depArray[i].depSource = "orphaned";
			}
		}
	}	
	return depArray;
}

// 
// Given a package.json object, extracts the license information and returns the license strings
// within an array (will support multiple licenses)
// Normalizes multiple representations into a single array of license strings
//
function getLicenseArray (pjson) {

	var obj, retObj, i;

	// There are many inconsistent uses of the license string in package.json
	// some refer to the field as "licenses"
	if (exists(pjson.license)) {
		obj = pjson.license;
	} else if (exists(pjson.licenses)) {
		obj = pjson.licenses;
	} else {
		return [];
	}

	// Most will simply have a string to refer to the license, we package it in an array
	if (typeof(obj) == "string") {
		return [obj];
	}
	// Some will represent this as an array of objects, each with a "type" field with the license string
	// [{type: "MIT"}, {type: "GPL"}]
	//
	if (Array.isArray(obj)) {
		retObj = [];
		for (i = 0; i<obj.length; i++) {
			if (typeof(obj[i]) == "string") {
				retObj.push(obj[i]);
			} else {
				retObj.push(obj[i].type);
			}	
		}
		return retObj;
	}
	//
	// Yet others will only have a single object not contained within an array
	// {type: "MIT"}
	//
	if (typeof(obj) == "object" && exists(obj.type)) {
		retObj = [obj.type];
		return retObj;
	}

	return [{"type" : "unrecognized"}];
}

//
// checks objects in the given array for the prop in the "name" field of an object
function findNameInObjectArray(arr, prop) {
	var i;
	for (var i = 0; i<arr.length; i++) {
		if (arr[i].name == prop) {
			return i;
		}
	}
	return -1;
}

function propInObject(obj, prop) {
	for (var key in obj) {
		if (key == prop) {
			return true;
		}
	}
	return false;
}

//---------------------------------------------------------------------------------
// npmmod = module@ver
// modpath = full dependency path on local file system in form #|module@ver|module@ver...
// pid = # - should be specified in the request paramaters passed in
//
// Priority is given to modpath
// 
//
function getNpmInfo(qobj, cb) {

	var pid, 
		path, 
		finalPath, 
		finalPathname,
		pkgsSave,
		pkgs;
	var modArr = [];

	if (!exists(qobj.pid)) {
		qobj.pid = '0';
	}
	pid = qobj.pid;


	// If there is a dependency path specified (parm[1]), then we actually get the package.json
	// directly from the file system 
	if (exists(qobj.modpath)) {

		// Build the pathname on the local disc to the package.json file
		//
		modArr = decodeURIComponent(qobj.modpath).split('|');

		// start the path from the pathname in the g_config that matches
		// the pid given
		path = mapPidToObject(pid).path;

		finalPath = _.reduce(modArr, function(memo,num) {
			return memo + "node_modules/" + num.substr(0, num.indexOf('@')) + "/"; }, path);

		// retrieve the information using the path to the package.json to get the information from the README 
		return getPackageInfo(finalPath, cb);

	// if there is not modpath, then we call out to the npm API to retrieve the information
	} else if (exists(qobj.npmmod)) {

		pkgs = [decodeURIComponent(qobj.npmmod)];
		pkgsSave = pkgs;
		logger ("GET DATA FOR : " + pkgs);

		npm.load(function(err,npm) {
		    npm.commands.view(pkgs, true, function(err, data) {
			    if (err) {
			    	logger ("Error retrieving data from npmjs.org");
			    	process.nextTick(function(){cb({'error' : "ERROR retrieving info for " + pkgs[0]}, null)});
			    	return;
			    } else {
			    	// npm returns the object we want wrapped in an object whose name is the version number
			    	// 
			    	var innerObj;
			    	for (var oname in data) {
			    		innerObj = data[oname];
			    		break;
			    	}

			    	// copy the name for readme retrieval
			    	//pkgs = [innerObj.name + " readme"];
			    	// indicate this was retreived from npmjs
			    	innerObj.name = innerObj.name + " (info retrieved from npmjs.org)";

 			    	process.nextTick(function() {cb(null, innerObj)});
 			    	return;
			    }	

		    });

		});    

	} else {
		process.nextTick(function(){cb({'error' : "must specify npmmod or modpath paramaters"}, null)});
		return;
	}
}

//---------------------------------------------------------------------------------
// Get information for a package.json file, and expand our the README by reading
// and inserting the readme if necessary
// we convert the readme to HTML here using Showdown for display
//
function getPackageInfo(finalPath, cb) {

	var finalPathname = finalPath + "package.json";

	// Attempt to read the package.json file
	//
    jsonfile.readFile(finalPathname, function(err, objJson) {

    	var converter;

    	if (err) {
    		process.nextTick(function(){cb(err, null)});
    		return;
    	} else {

    		return processPJsonReadme(finalPath, objJson, cb);

    	}
    });	
}


function processPJsonReadme (finalPath, objJson, cb) {

	// Process the README info with Showdown to convert to HTML displayable data
	// this is only applied to the Readme
	var converter = new showdown.converter();

	var readmeFilename = null;
	if (exists(objJson.readmeFilename)) {
		readmeFilename = finalPath + objJson.readmeFilename;
	} else  { 
		readmeFilename = finalPath + "README.md";
	}
	logger ("readmeFilename = " + readmeFilename);
	logger ("finalPath = " + finalPath);
	logger ("obj.readmeFilename = " + objJson.readmeFilename);

	// If the README file is defined, but not included in the JSON object, then retrieve it
	//
	if (readmeFilename !== null) {
		fs.readFile(readmeFilename, 'utf8', function(err, data) {

			if (err) {
				if (objJson.readme !== undefined) {
					objJson.readme = converter.makeHtml(objJson.readme);
					process.nextTick(function() {cb (null, objJson)});
					return;
				}
				process.nextTick(function() {cb (err, null)});
				return;
			} else {
				objJson.readme = converter.makeHtml(data);
				process.nextTick(function(){cb(null, objJson)});
				return;
			}	
		});

	} else {
		if (objJson.readme !== undefined) {
			objJson.readme = converter.makeHtml(objJson.readme);
		}
		process.nextTick(function(){cb(null, objJson)});
		return;
	}	
}



if (process.env.NODE_ENV === "test") {
	module.exports.readConfigFile = readConfigFile;
	module.exports.mapPidToObject = mapPidToObject;
	module.exports.findNameInObjectArray = findNameInObjectArray;
	module.exports.propInObject = propInObject;
	module.exports.mergeDependencies = mergeDependencies;
	module.exports.getLicenseArray = getLicenseArray;
}

module.exports.getProjectList = getProjectList;
module.exports.getModuleList = getModuleList;
module.exports.getNpmInfo = getNpmInfo;
module.exports.initConfig = initConfig;
module.exports.setLogger = setLogger;

