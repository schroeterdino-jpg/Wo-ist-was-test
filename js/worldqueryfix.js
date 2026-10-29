/* JARVIS v6.5 – globale Informationsfragen nicht versehentlich als leere Weltkugel behandeln.
   Die bestehende Weltkugel-/Spanien-/Portugal-Follow-up-Logik bleibt unverändert. */
(function(){
  'use strict';
  function isGlobalInfoQuestion(text){
    const t=String(text||'').toLowerCase().replace(/[?!.,]/g,' ').replace(/\s+/g,' ').trim();
    if(!t) return false;
    const global=/\b(auf der welt|weltweit|in der welt|welche länder|welchen ländern|wo überall)\b/.test(t);
    if(!global) return false;
    // echte globale Sach-/Lagefragen. Reine Kartenbefehle bleiben beim bisherigen Weltkugel-Code.
    const topic=/\b(krieg|kriege|kriegs|konflikt|konflikte|kämpf|kaempf|unruhen|brände|braende|waldbränd|waldbrand|überschwemm|ueberschwemm|katastroph|hunger|dürre|duerre|ausbruch|epidem|pandem)\b/.test(t);
    const asks=/\b(wo|welche|was|gibt es|gibt's|aktuell|gerade|derzeit|heute)\b/.test(t);
    return topic && asks;
  }

  // Vor dem bisherigen localcommands.js-Handler abfangen: false bedeutet "an die KI/Aktionsplanung weiterreichen".
  if(typeof window.handleLocalCommand==='function' && !window.handleLocalCommand._globalInfo65){
    const old=window.handleLocalCommand;
    const wrapped=function(text){
      if(isGlobalInfoQuestion(text)) return false;
      return old.apply(this,arguments);
    };
    wrapped._globalInfo65=true;
    window.handleLocalCommand=wrapped;
  }

  // Der KI klar sagen, dass globale Lagefragen aktuelle Web-Infos brauchen und NICHT world_news mit leerem Ort.
  // Eintrag in der Ergänzungs-Liste der KI-Anweisung (commands.js, jvChain), Rang 30
  if(window.jvChain){
    window.jvChain.use('buildSystemPrompt','worldqueryfix',function(next,args){
      const text=args[0];
      let p=next();
      if(isGlobalInfoQuestion(text)) p += '\n\nGLOBALE LAGEFRAGE: Der Nutzer fragt nach mehreren Orten/Regionen weltweit (z.B. wo aktuell Krieg ist). Nutze dafür web_lookup mit einer aktuellen, präzisen Suchanfrage und beantworte die Frage inhaltlich. Nutze NICHT world_news mit leerem news_place und öffne nicht nur die Weltkugel. Die normale world_news-Logik für konkrete Orte wie „Was ist aktuell in Spanien los?“ bleibt unverändert.';
      return p;
    },30);
  }
})();
