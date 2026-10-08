import {cp,mkdir,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {renderSeo} from '../seo/render.mjs';

const output='dist';
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const entry of ['index.html','404.html','styles.css','app.js','analytics.js','success-toast.js','robots.txt','sitemap.xml','site.webmanifest','favicon.svg','favicon-32.png','apple-touch-icon.png','assets','lib','resources','start-a-project','carcare','project-management','pm','share'])await cp(entry,`${output}/${entry}`,{recursive:true});
await cp('carcare/customer',`${output}/carcare/feedback`,{recursive:true});
await cp('carcare/staff',`${output}/carcare/complete`,{recursive:true});

const publicConfig={supabaseUrl:process.env.PUBLIC_SUPABASE_URL||'',supabaseAnonKey:process.env.PUBLIC_SUPABASE_ANON_KEY||'',googleAnalyticsId:process.env.PUBLIC_GOOGLE_ANALYTICS_ID||'',paymentsEnabled:Boolean(process.env.PAYSTACK_SECRET_KEY)};
await writeFile(`${output}/runtime-config.js`,`globalThis.__ARKHIMAR_CONFIG__=${JSON.stringify(publicConfig)};\n`);
await build({entryPoints:['auth-nav.js'],outfile:`${output}/auth-nav.js`,bundle:true,format:'esm',target:['es2022'],minify:true,sourcemap:false,legalComments:'none'});
await build({entryPoints:['pm/pm.js','pm/auth.js'],outdir:`${output}/pm`,entryNames:'[name]',bundle:true,format:'esm',target:['es2022'],minify:true,sourcemap:false,legalComments:'none'});
await build({entryPoints:['carcare/admin/admin.js'],outfile:`${output}/carcare/admin/admin.js`,bundle:true,format:'esm',target:['es2022'],minify:true,sourcemap:false,legalComments:'none'});
const seoIndexable=process.env.SEO_INDEXABLE==='true'&&process.env.VERCEL_ENV==='production';
await renderSeo(output,{indexable:seoIndexable,verification:seoIndexable?(process.env.GOOGLE_SITE_VERIFICATION||''):''});
async function installSuccessToasts(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=`${directory}/${entry.name}`;
    if(entry.isDirectory())await installSuccessToasts(path);
    else if(entry.name.endsWith('.html')){
      const html=await readFile(path,'utf8');
      let next=html;if(!next.includes('/analytics.js'))next=next.replace('</body>','<script src="/analytics.js"></script></body>');if(!next.includes('/success-toast.js'))next=next.replace('</body>','<script src="/success-toast.js"></script></body>');if(next!==html)await writeFile(path,next);
    }
  }
}
await installSuccessToasts(output);
console.log(`Static build created in ${output}/ (${publicConfig.supabaseUrl?'cloud backend configured':'authentication configuration required'}; ${seoIndexable?'production indexing enabled':'preview indexing disabled'}).`);
