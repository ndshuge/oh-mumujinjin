"use strict";
// Noninvasive acceptance check of adaptive staged selection report.
const fs=require("fs"),path=require("path");
const file=path.join(__dirname,"..","output","lab","g4","STAGED_SELECTION_ADVICE_G0.json"),
 report=JSON.parse(fs.readFileSync(file,"utf8"));
const families=["search","rule-puct","neural","hybrid"];
if(!report.basedOn||report.basedOn.illegal!==0||report.basedOn.expected!==384)
 throw Error("Unexpected season receipt");
if(families.some(f=>!report.protectedFamilies[f]))throw Error("Lost strategy family");
if(report.basedOn.complete){
 if(!report.shortlistIsValid||report.shortlist.length!==16||
    new Set(report.shortlist.map(x=>x.id)).size!==16)
    throw Error("Invalid complete shortlist");
 for(const f of families){
  const team=report.shortlist.filter(x=>x.family===f);
  if(team.length!==4||team.filter(x=>x.path==="specialist-or-fourth").length!==1)
   throw Error("Lost family/specialist slot: "+f);
 }
 if(report.basedOn.acceptedRounds!==6||!report.basedOn.pairedSeatComplete)
  throw Error("Premature selection");
}else{
 if(report.shortlistIsValid||report.shortlist.length)
  throw Error("Premature promotion from partial games");
 if(report.status!=="PROVISIONAL_NOT_FOR_SELECTION")
  throw Error("Missing provisional warning");
}
console.log("G4_SELECTION_POLICY_ACCEPTANCE",JSON.stringify({
 passed:true,status:report.status,matches:report.basedOn.matches,
 acceptedRounds:report.basedOn.acceptedRounds,
 familySlots:Object.fromEntries(families.map(f=>[f,4])),formalPromotion:false
}));
