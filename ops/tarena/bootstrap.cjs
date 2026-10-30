const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const {PrismaClient}=require('/workspace/apps/api/node_modules/@prisma/client');
const {hash}=require('/workspace/apps/api/node_modules/bcryptjs');
async function main(){
 if(process.env.DF_TARENA_PILOT!=='1'||fs.readFileSync('/pilot/pilot.marker','utf8')!=='df-tarena-synthetic-only-20261029\n')throw Error('pilot guard');
 const password=process.env.PILOT_DB_API_PASSWORD;
 if(!/^[A-Za-z0-9_-]{40,64}$/.test(password||''))throw Error('password guard');
 const url=`postgresql://pilot_owner:${process.env.PILOT_DB_OWNER_PASSWORD}@postgres:5432/df_tarena_test?schema=public`;
 const result=spawnSync('node',['apps/api/node_modules/prisma/build/index.js','migrate','deploy','--schema','apps/api/prisma/schema.prisma'],{cwd:'/workspace',env:{...process.env,DATABASE_URL:url},encoding:'utf8'});
 if(result.status!==0)throw Error('migration failed');
 const db=new PrismaClient({datasources:{db:{url}}});
 try{
  if(await db.product.count()||await db.user.count()||await db.order.count())throw Error('fresh empty database required');
  await db.$executeRawUnsafe(`CREATE ROLE pilot_api LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
  await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO pilot_api');
  await db.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pilot_api');
  await db.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pilot_api');
  await db.$executeRawUnsafe('REVOKE ALL ON TABLE public._prisma_migrations FROM pilot_api');
  if (process.env.PILOT_DB_BACKUP_PASSWORD) {
   const backupPassword = process.env.PILOT_DB_BACKUP_PASSWORD;
   if (!/^[A-Za-z0-9_-]{40,64}$/.test(backupPassword)) throw Error('backup password guard');
   await db.$executeRawUnsafe(`CREATE ROLE rehearsal_backup LOGIN PASSWORD '${backupPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
   await db.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO rehearsal_backup');
   await db.$executeRawUnsafe('GRANT SELECT ON ALL TABLES IN SCHEMA public TO rehearsal_backup');
   await db.$executeRawUnsafe('GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO rehearsal_backup');
  }
  for(const role of ['admin','picker','courier']){
   const secret=process.env[`PILOT_${role.toUpperCase()}_PASSWORD`];
   if(!secret||secret.length<32)throw Error('fresh staff password required');
   await db.user.create({data:{id:`tarena-${role}`,email:`${role}@tarena.invalid`,name:`Pilot ${role}`,passwordHash:await hash(secret,12),role,roles:[role]}});
  }
  await db.category.createMany({data:[{id:'tarena-vegetables',name:'Тестовые овощи',nameTj:'Сабзавоти санҷишӣ',slug:'vegetables',imageUrl:'/storefront/v2/vegetables.webp'},{id:'tarena-fruits',name:'Тестовые фрукты',nameTj:'Меваи санҷишӣ',slug:'fruits',imageUrl:'/storefront/v2/fruits.webp'}]});
  const products=Array.from({length:100},(_,i)=>({id:`tarena-product-${i+1}`,slug:`tarena-product-${i+1}`,categoryId:i<50?'tarena-vegetables':'tarena-fruits',name:i===0?'Тест: картофель белый':i===1?'Тест: картофель красный':`Тестовый продукт ${i+1}`,nameTj:`Маҳсулоти санҷишӣ ${i+1}`,description:'Синтетический товар закрытого тестового стенда.',descriptionTj:'Маҳсулоти санҷишӣ.',imageUrl:i<50?'/storefront/v2/vegetables.webp':'/storefront/v2/fruits.webp',unit:'kg',currentPurchasePrice:'5.00',currentSalePrice:i===0?'7.00':i===1?'9.00':'10.00',isWeighted:true,minQuantity:'0.5',quantityStep:'0.5',sortOrder:i}));
  await db.product.createMany({data:products});
  for(const [key,value] of Object.entries({minimum_order_amount:'0',delivery_fee:'0',service_fee:'0',service_fee_percent:'0',default_picker_id:'tarena-picker',default_courier_id:'tarena-courier'}))await db.appSetting.create({data:{key,value}});
  await db.appSetting.create({data:{key:'tarena_pilot_marker',value:'df-tarena-synthetic-only-20261029'}});
  console.log(JSON.stringify({syntheticOnly:true,products:100,staff:3,migrationsApplied:true,runtimeSuperuser:false}));
 }finally{await db.$disconnect();}
}
main().catch(()=>{console.error('Pilot bootstrap failed safely; inspect private state, never run against a nonempty database.');process.exitCode=1;});
