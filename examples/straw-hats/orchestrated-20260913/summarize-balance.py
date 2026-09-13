import argparse,json,hashlib
from pathlib import Path
parser=argparse.ArgumentParser(description='Summarize explicit private per-unit final balance reports into project-relative public evidence.')
parser.add_argument('--reports-dir', required=True)
parser.add_argument('--out-dir', required=True)
args=parser.parse_args()
root=Path.cwd();private=Path(args.reports_dir).resolve();public=Path(args.out_dir).resolve();public.mkdir(parents=True,exist_ok=True)

names=['luffy','franky','sanji','robin','zoro','brook','chopper','usopp','jinbe','nami'];rs=json.load(open(private/'range-evidence.json'));ranges={x['id']:x['edges'] for x in rs};units=[]
for n in names:
 src=private/(n+'-final-balance.json')
 if not src.exists():raise FileNotFoundError(src)
 r=json.load(open(src));u=r['units'][0];content=Path(u['path']).read_bytes();assert hashlib.sha256(content).hexdigest()==u['sha256'];raw=json.loads(content)
 edges=[]
 for e in u['purchaseEdges']:
  good=[s['scenario'] for s in e['scenarios'] if s['damageDelta']>1e-6 or s['controlDelta']>1e-6]
  boundary=next((v for v in ranges.get(u['id'],[]) if v['path']==e['path'] and v['tier']==e['tier']),None)
  a=[0,0,0];b=[0,0,0];a[e['path']]=e['tier']-1;b[e['path']]=e['tier'];supports={tuple(v['tiers']):v for v in u.get('supportResults',[])}
  sa=supports.get(tuple(a),{});sb=supports.get(tuple(b),{});heal=sb.get('healed',0)-sa.get('healed',0)
  retarget=next((x for x in json.load(open(private/'nami-retarget-evidence.json'))['edges'] if x['path']==e['path'] and x['tier']==e['tier']),None) if n=='nami' else None
  edges.append({'retargetProbe':retarget,'path':e['path'],'tier':e['tier'],'name':e['name'],'cost':e['purchaseCost'],'movingImprovements':good,'healingDelta':heal,'rangeBoundary':boundary,'observedBenefit':bool(good or heal>1e-6 or retarget and retarget['after']['replacementDamage']>retarget['before']['replacementDamage'] or boundary and boundary['after']['primaryHits']>boundary['before']['primaryHits']), 'worstDamageDelta':min(s['damageDelta'] for s in e['scenarios'])})
 compact={'evaluatedTargetTags': ['can-hear'] if n in ['brook','nami'] else [],'reproductionHearingFlag':'present' if n in ['brook','nami'] else 'absent','slug':n,'id':u['id'],'unitPath':str(Path(u['path']).relative_to(root)),'sha256':u['sha256'],'legalBuilds':u['legalBuilds'],'movingProbes':len(u['results']),'qualificationReadiness':u['qualification']['readiness'],'warnings':[f for f in u['qualification']['findings'] if f['severity']!='info'],'purchases':edges,'matchedSpending':[{**{k:v for k,v in m.items() if k!='winner'},'winner':{k:v for k,v in m['winner'].items() if k in ['tiers','cost','policy','damage','kills','leaks','survivors','movementPreventedSeconds']} if m['winner'] else None} for m in u['matchedSpending']],'bestHealing':max(u.get('supportResults',[]),key=lambda v:(v['healed'],-v['cost']),default=None)}
 if compact['bestHealing']:compact['bestHealing']={k:v for k,v in compact['bestHealing'].items() if k in ['tiers','cost','healed','injuryApplied','rangeRecipients','produced','collected','cash']}
 compact['bestControl']=[{'budget':budget,'scenario':scenario,'winner':{k:v for k,v in max([x for x in u['results'] if x['cost']<=budget and x['scenario']==scenario],key=lambda x:(x['movementPreventedSeconds'],-x['cost'])).items() if k in ['cost','tiers','policy','damage','movementPreventedSeconds']}} for budget in [1000,5000,15000] for scenario in ['dense-wave','concealment','fast-wave','control-immune'] if any(x['cost']<=budget and x['scenario']==scenario for x in u['results'])]
 compact['derivation']={k:v for k,v in r.get('derivation',{}).items() if k not in ['changedFields']}
 if r.get('derivation'):compact['derivation']['changedPaths']=[x['path'] for x in r['derivation']['changedFields']]
 compact['bestHealingByBudget']=[{'budget':budget,'winner':{k:v for k,v in max([x for x in u['supportResults'] if x['cost']<=budget],key=lambda x:(x['healed'],-x['cost'])).items() if k in ['cost','tiers','healed','injuryApplied']}} for budget in [1000,5000,15000] if any(x['cost']<=budget for x in u['supportResults'])]
 compact['baseResults']=[{k:v for k,v in row.items() if k in ['scenario','damage','kills','leaks','cost','movementPreventedSeconds']} for row in u['results'] if row['tiers']==[0,0,0]]
 units.append(compact)
summary={'methodology':r['protocol'],'limits':r['limits'],'rangeBoundaryMethod':'For every reach-increasing straight-path purchase, one stationary 100000-HP target is placed halfway between old/new base-form primary reach; compare 15-second automatic primary hits. This isolates reach value outside moving encounter coverage.','units':units}
(public/'comparison.json').write_text(json.dumps(summary,indent=2)+'\n')
lines=['These comparisons cover independently evaluated single placements in synthetic encounters. They do not establish team balance or live-game parity. Full reports are retained privately under `.scratch/straw-hats/orchestrated-20260913/*-final-balance.json`. Exact source paths and SHA-256 hashes are in `comparison.json`.','', '| Unit | Legal builds | Moving probes | Purchases with measured benefit | Best supplied-injury healing |','| --- | ---: | ---: | ---: | ---: |']
for u in units:lines.append(f"| {u['slug']} | {u['legalBuilds']} | {u['movingProbes']} | {sum(e['observedBenefit'] for e in u['purchases'])}/15 | {u['bestHealing']['healed'] if u['bestHealing'] else 0:.0f} |")
for budget in [1000,5000,15000]:
 lines+=['',f'At a shared {budget:,} budget cap, the strongest damage result per unit is below. Each cell gives damage / actual spend / form policy. Costs need not be equal.','', '| Unit | Dense wave damage | Boss damage | Concealed damage | Fast wave damage |','| --- | ---: | ---: | ---: | ---: |']
 for u in units:
  rows={m['scenario']:m['winner'] for m in u['matchedSpending'] if m['budget']==budget}
  vals=[f"{rows[s]['damage']:.0f} / {rows[s]['cost']:.0f} / {rows[s]['policy']}" if rows.get(s) else 'unaffordable' for s in ['dense-wave','armored-boss','concealment','fast-wave']]
  lines.append('| '+u['slug']+' | '+' | '.join(vals)+' |')
lines+=['','Purchases without a measured gain need narrower probes or generated refinement. They are not automatically useless.']
for u in units:
 for e in u['purchases']:
  if not e['observedBenefit']:lines+=['',f"- {u['slug']} path {e['path']+1}, tier {e['tier']}: {e['name']}. No gain in moving damage/control, supplied-injury healing, or the automatic range-boundary probe."]
(public/'metrics.md').write_text('\n'.join(lines)+'\n')
print([(u['slug'],sum(e['observedBenefit'] for e in u['purchases'])) for u in units])

# Convert provenance paths without changing their referenced artifact hashes.
def portable(value, key=''):
 if isinstance(value,dict):return {k:portable(v,k) for k,v in value.items()}
 if isinstance(value,list):return [portable(v,key) for v in value]
 if isinstance(value,str) and value.startswith(str(root)+'/'):return str(Path(value).relative_to(root))
 if isinstance(value,str) and key in ['path','measuredReportPath','measurementUnitPath','finalUnitPath','unitPath'] and Path(value).is_absolute() and value.endswith('.json'):
  alias=private/(Path(value).stem+'-measured-balance.json')
  if not alias.exists():raise ValueError('Unmapped external provenance path: '+value)
  return str(alias.relative_to(root))
 return value
(public/'comparison.json').write_text(json.dumps(portable(summary),indent=2)+'\n')
for name in ['hearing','displacement']:
 evidence=json.load(open(private/(name+'-evidence.json')))
 if name=='hearing':evidence['results']=[{k:v for k,v in row.items() if k!='statusEvents'} for row in evidence['results']]
 (public/(name+'.json')).write_text(json.dumps(portable(evidence),indent=2)+'\n')
audit=[]
for unit in units:
 document=json.loads((root/unit['unitPath']).read_bytes());references=[];dependencies=[]
 def inspect(value,path=''):
  if isinstance(value,dict):
   for key,child in value.items():
    if key in ['description','name']:continue
    if key in ['requiresTags','immuneTo','tags']:dependencies.append({'path':path+'/'+key,'value':child})
    inspect(child,path+'/'+key)
  elif isinstance(value,list):
   for index,child in enumerate(value):inspect(child,path+'/'+str(index))
  elif value=='can-hear':references.append(path)
 inspect(document)
 audit.append({'slug':unit['slug'],'id':unit['id'],'path':unit['unitPath'],'sha256':unit['sha256'],'executableCanHearReferences':references,'tagDependencies':dependencies,'absentVsPresentHearingEquivalent':not references,'evaluatedAdditionalTags':unit['evaluatedTargetTags']})
(public/'tag-audit.json').write_text(json.dumps({'method':'Recursively scan each exact final artifact for executable can-hear references, excluding names and descriptions. Every report hash is checked against current input bytes above. Only Brook depends on can-hear and was separately simulated with hearing enabled. The other nine are unchanged by adding this one arbitrary tag. Canonical eligibility tags are independently normalized from explicit host booleans. Protocols and per-row hearing flags preserve exact original inputs.','units':audit},indent=2)+'\n')
