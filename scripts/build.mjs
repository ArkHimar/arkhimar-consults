import {cp,mkdir,rm,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';

const output='dist';
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const entry of ['index.html','styles.css','app.js','robots.txt','sitemap.xml','assets','lib','start-a-project','project-management','pm'])await cp(entry,`${output}/${entry}`,{recursive:true});

const publicConfig={supabaseUrl:process.env.PUBLIC_SUPABASE_URL||'',supabaseAnonKey:process.env.PUBLIC_SUPABASE_ANON_KEY||''};
await writeFile(`${output}/runtime-config.js`,`globalThis.__ARKHIMAR_CONFIG__=${JSON.stringify(publicConfig)};\n`);
await build({entryPoints:['pm/pm.js','pm/auth.js'],outdir:`${output}/pm`,entryNames:'[name]',bundle:true,format:'esm',target:['es2022'],minify:true,sourcemap:false,legalComments:'none'});
console.log(`Static production build created in ${output}/ (${publicConfig.supabaseUrl?'cloud backend configured':'authentication configuration required'}).`);
