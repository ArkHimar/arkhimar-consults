import {cp,mkdir,rm,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {renderSeo} from '../seo/render.mjs';

const output='dist';
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const entry of ['index.html','404.html','styles.css','app.js','robots.txt','sitemap.xml','site.webmanifest','favicon.svg','favicon-32.png','apple-touch-icon.png','assets','lib','start-a-project','project-management','pm','share'])await cp(entry,`${output}/${entry}`,{recursive:true});

const publicConfig={supabaseUrl:process.env.PUBLIC_SUPABASE_URL||'',supabaseAnonKey:process.env.PUBLIC_SUPABASE_ANON_KEY||''};
await writeFile(`${output}/runtime-config.js`,`globalThis.__ARKHIMAR_CONFIG__=${JSON.stringify(publicConfig)};\n`);
await build({entryPoints:['auth-nav.js'],outfile:`${output}/auth-nav.js`,bundle:true,format:'esm',target:['es2022'],minify:true,sourcemap:false,legalComments:'none'});
await build({entryPoints:['pm/pm.js','pm/auth.js'],outdir:`${output}/pm`,entryNames:'[name]',bundle:true,format:'esm',target:['es2022'],minify:true,sourcemap:false,legalComments:'none'});
const seoIndexable=process.env.SEO_INDEXABLE==='true'&&process.env.VERCEL_ENV==='production';
await renderSeo(output,{indexable:seoIndexable,verification:seoIndexable?(process.env.GOOGLE_SITE_VERIFICATION||''):''});
console.log(`Static build created in ${output}/ (${publicConfig.supabaseUrl?'cloud backend configured':'authentication configuration required'}; ${seoIndexable?'production indexing enabled':'preview indexing disabled'}).`);
