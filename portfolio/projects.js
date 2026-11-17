import {createClient} from '@supabase/supabase-js';

const practice=location.pathname.match(/^\/portfolio\/(automation|development|architecture|design)\/?$/)?.[1];
const grid=document.querySelector('.selected-work .work-grid');
const config=globalThis.__ARKHIMAR_CONFIG__||{};

if(practice&&grid&&config.supabaseUrl&&config.supabaseAnonKey){
  const client=createClient(config.supabaseUrl,config.supabaseAnonKey,{auth:{persistSession:false}});
  const {data}=await client.from('portfolio_projects').select('id,title,summary,image_url,external_url,status,tags').eq('practice',practice).eq('published',true).order('sort_order').order('created_at',{ascending:false});
  for(const project of data||[]){
    const wrapper=document.createElement(project.external_url?'a':'article');wrapper.className='work-card reveal is-visible';
    if(project.external_url){wrapper.href=project.external_url;try{if(new URL(project.external_url,location.href).origin!==location.origin){wrapper.target='_blank';wrapper.rel='noopener noreferrer'}}catch{}}
    const image=document.createElement('img');image.src=project.image_url;image.alt=project.title;image.loading='lazy';
    const copy=document.createElement('div');copy.className='work-copy';
    const row=document.createElement('div');row.className='work-title-row';const title=document.createElement('h3');title.textContent=project.title;const status=document.createElement('small');status.textContent=project.status;
    const summary=document.createElement('p');summary.textContent=project.summary;const tags=document.createElement('div');tags.className='tags';
    for(const item of project.tags||[]){const tag=document.createElement('span');tag.textContent=item.startsWith('#')?item:`# ${item}`;tags.append(tag)}
    row.append(title,status);copy.append(row,summary,tags);wrapper.append(image,copy);grid.append(wrapper);
  }
}
