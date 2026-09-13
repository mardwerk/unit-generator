import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createMangaEncounter} from '../../../../packages/definitions/dist/manga-mayhem/simulator.js';
import {compileMangaBuild,legalMangaTiers} from '../../../../packages/definitions/dist/manga-mayhem/compiler.js';
const unit=JSON.parse(fs.readFileSync(new URL('../../runs/crew-v6-nami-20260913/nami-faithful/unit.json',import.meta.url)));
const target=()=>[{id:'victim',x:20,y:0,pathPosition:20,health:1000000,weakWilled:true,stunnable:true,slowable:true,displaceable:true}];
const result={builds:[],cadence:[],purchases:[]};
for(let a=0;a<=5;a++)for(let b=0;b<=5;b++)for(let c=0;c<=5;c++){
 const tiers=[a,b,c];if(!legalMangaTiers(tiers))continue;
 const e=createMangaEncounter(unit,tiers,target());const highest=Math.max(...tiers);
 const expected=highest===0?null:highest<5?'gust-sword':'raitei';assert.equal(e.snapshot().technique,expected);
 if(expected){assert.equal(e.requestTechnique(),true);e.advance(2);const s=e.snapshot();
 assert(!s.events.some(x=>['stun','slow','status'].includes(x.type)));
 assert.equal(s.targets[0].x,expected==='gust-sword'?14:20);
 assert.equal(s.techniqueAt,12);
 result.builds.push({tiers,technique:expected,health:s.targets[0].health,x:s.targets[0].x,techniqueAt:s.techniqueAt});
 }else result.builds.push({tiers,technique:null});
}
for(let tier=0;tier<=5;tier++){
 const tiers=[0,tier,0],build=compileMangaBuild(unit,tiers);const e=createMangaEncounter(unit,tiers,target());e.advance(20);const s=e.snapshot();
 assert(!s.events.some(x=>['stun','slow','status'].includes(x.type)));
 result.cadence.push({tier,period:build.forms[0].primary.period,windup:build.forms[0].primary.windup,primaryHits:s.events.filter(x=>x.type==='primary').length,techniqueTiming:unit.forms[0].techniques.map(t=>({id:t.id,windup:t.windup,recovery:t.recovery})),heatEgg:unit.mechanics.attacks[0]});
 if(tier)assert(result.cadence[tier].period<result.cadence[tier-1].period);
}
for(let path=0;path<3;path++)for(let tier=1;tier<=5;tier++){
 const before=[0,0,0],after=[0,0,0];before[path]=tier-1;after[path]=tier;
 assert.notDeepEqual(compileMangaBuild(unit,before).modifiers,compileMangaBuild(unit,after).modifiers);
 result.purchases.push({path,tier,effectiveModifierChanged:true});
}
fs.writeFileSync(new URL('./nami-v6-probe.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({legalBuilds:result.builds.length,cadence:result.cadence.map(({tier,period,windup,primaryHits})=>({tier,period,windup,primaryHits})),purchases:result.purchases.length}));
