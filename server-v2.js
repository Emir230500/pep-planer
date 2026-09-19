"use strict";
const fs=require("fs"),path=require("path");
let code="";
for(let i=1;i<=11;i++)code+=fs.readFileSync(path.join(__dirname,`server-v2.part${i}`),"utf8");
new Function("require","__dirname","__filename","module","exports",code)(require,__dirname,__filename,module,exports);
