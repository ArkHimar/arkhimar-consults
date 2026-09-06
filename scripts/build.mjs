import {cp,mkdir,rm} from 'node:fs/promises';
const output='dist';await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});for(const entry of ['index.html','styles.css','app.js','assets','start-a-project','project-management','pm'])await cp(entry,`${output}/${entry}`,{recursive:true});console.log('Static production build created in dist/.');
