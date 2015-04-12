NpmAPI
=========

A small library providing utility methods to retrieve information about the local NPM installation.  A useful
API for administrative tools which are interested in multiple projects on a server.  I tried using the 
npm API from npmjs.org (such as npm ls, npm view), but found it to be very awkward when trying to enumerate
multiple projects and project directories outside of the current server directory.

**NPMAPI** is configured via an npmlpb.json file in ther server root directory which defines your projects root
directory as well as specific project directories you are interested in browsing via the API.  The basic functions
are as follows:

###initConfig

Forces a read (or re-read) of the projects list as specified by npmlpb.json.  This caches the results, and the
cached results are returned when getProjectList is called.  

Returns an array of objects (see **getProjectList** below)

*Usage:*
```
initConfig(function(plist){});
```

###getProjectList

Returns an array of all enumerated projects that are found based on settings
in the **npmlpb.json** config file in the project directory.  uid refers to the project ID that
is you use in subsequent calls to retrieve information about that project. uid is an md5 hash.

Returns an array of objects in the form of:
```
   [ { name: 'npm',
       path: 'node_modules/npm/',
       uid: '564be1a31875a40ba5c48a6e41f74ed3' },
     { name: 'columnify',
       path: 'node_modules/npm/node_modules/columnify/',
       uid: '9d9e1892d157ebe883e904f2de6475c1' },
     { name: 'npmapi',
       path: '../npmapi/',
       uid: 'b3ab76844df283c9448e7521b5cf21d5' },
     { name: 'testing-project',
       path: '../testing-project/',
       uid: '6d78675e6694c45a2d353908165bffcc' } ] }
```

*Usage:*
```
getProjectList(function(err, retObj) {};)
```

###getModuleList
Get the list of modules found in the project structure for the project specified by uid.  Returns an object of the form:
```
{
  name: "local-package-browser",
  version: "0.4.0",
  license: ["MIT"],    // returns an array, allows for multiple licenses (rare, but exists).  
  dependencies: Array[13],
  notInstalled: true,  // Only present and true if NOT installed
  depSource: "dev",    // value may be "dev" or "primary"
  orphaned: true,    // Only present if module exists, but not specified in package.json
  packageJson: [Object]  // contains the actual package.json for this module, 
                         // and will insert the README.md into the readme property if it exists
}
```
**dependencies** is an array of objects of the same form. 

This will show you a combination of the modules which are installed in the node_modules directory, as well as the modules which
are specified in the devDependencies and dependencies section in the package.json.  Perhaps a better name for this would have
been "modules" since it makes it easy to see everything in the tree whether a primary dependency, dev dependency, or orphaned module.
If a module is specified in package.json, but not available in the node_modules directory, then "notInstalled" will be set with the
value of ```true```.  If in fact this module is specified in package.json, depSource will indicate where it is specified.
"primary" indicates it is in "dependencies", and "dev" indicates it is in "devDependencies".  If it is listed in both, the value will
be set to "primary".  

*Usage:*
```
getModuleList(uid, function(err, retObj) {};)
```

**WARNING: since an node_modules structure may contain many duplicate packages, the object created is likely cyclical, and must
be decycled if you want to convert to JSON.  See the npm module "cycle.js" for more**


###getNpmInfo

Gets detailed information (package.json) about the specific package specified in the dependency tree.  If a path to the
specific module is not provided, then information is retrieved from npmjs.org (npm view).  At least one of the
npmmod or modpath paramaters must be specified.

As a nice feature, this will automatically populate an object property "readme" with the contents of the specified readmefile
in package.json.  This will overwrite any content in the "readme" property that is in package.json if, and only if the 
property "readmeFilename" is specified in package.json

npmmod = "module@ver" - used to get info from npmjs.org

modpath = full dependency path on local file system in form module@ver|module@ver...

uid = the uid provided in the retrieved project list

*Usage*
```
getNpmInfo(uid, npmmod, modpath, function(err, retObj) {})
```
Returns the package.json object with the readme populated as specified above


###npmlpb.json configuration file

Config file used for specifying scannable projects, or your root project directory (will scan all sub-directories)
A sample file npmlpb.json is included in the install package
**This file must be placed in the application directory where node is running**
```
{
	"projects_rootdir" : "../", 
	"projects" : [				 
				   {"name" : "npm", "path": "node_modules/npm/"},
				   {"name" : "columnify", "path": "node_modules/npm/node_modules/columnify/"}
				 ]
}
```

## Installation

  npm install npmapi

## Tests

Tests are located in npmapi_test.js.  You will need mocha installed, and set the node environment to "test".  
Run the tests from the shell with

```
NODE_ENV='test' mocha npmapi_test.js --reporter spec
```

## License

The MIT License (MIT)

Copyright (c) 2014, Ask.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.



