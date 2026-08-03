const familyMonthly = {
      1:80,
      2:120,
      3:140,
      4:160
    };

    const extras = {
      "none":{label:"No optional service",amount:0,promoEligible:false},
      "fitness-dropin":{label:"Fitness drop-in",amount:15,promoEligible:false},
      "private-30":{label:"Private lesson — 30 minutes",amount:25,promoEligible:false},
      "private-60":{label:"Private lesson — 60 minutes",amount:50,promoEligible:true},
      "private-90":{label:"Private lesson — 90 minutes",amount:70,promoEligible:true},
      "semi-private":{label:"Semi-private lesson — 90 minutes",amount:60,promoEligible:false}
    };

    const el = {
      familyName:document.getElementById("familyName"),
      coachName:document.getElementById("coachName"),
      coachRecommendation:document.getElementById("coachRecommendation"),
      addAthlete:document.getElementById("addAthlete"),
      athleteList:document.getElementById("athleteList"),
      athleteTemplate:document.getElementById("athleteTemplate"),
      extra:document.getElementById("extra"),
      support:document.getElementById("support"),
      privatePromo:document.getElementById("privatePromo"),
      fitnessCredit:document.getElementById("fitnessCredit"),
      monthlySponsor:document.getElementById("monthlySponsor"),
      annualSponsor:document.getElementById("annualSponsor"),
      dueNow:document.getElementById("dueNow"),
      monthlyTotal:document.getElementById("monthlyTotal"),
      firstYearTotal:document.getElementById("firstYearTotal"),
      annualTotal:document.getElementById("annualTotal"),
      breakdown:document.getElementById("breakdown"),
      summary:document.getElementById("summary"),
      standardCompare:document.getElementById("standardCompare"),
      unlimitedCompare:document.getElementById("unlimitedCompare"),
      printButton:document.getElementById("printButton"),
      resetButton:document.getElementById("resetButton")
    };

    function money(value){
      return "$" + Math.max(0,Math.round(Number(value)||0)).toLocaleString();
    }

    function line(label,amount,{credit=false,total=false}={}){
      const row=document.createElement("div");
      row.className=["line",credit?"credit":"",total?"total":""].filter(Boolean).join(" ");

      const a=document.createElement("span");
      const b=document.createElement("span");

      a.textContent=label;
      b.textContent=(credit?"-":"")+money(Math.abs(amount));

      row.append(a,b);
      return row;
    }

    function addAthlete(defaults={}){
      const fragment=el.athleteTemplate.content.cloneNode(true);
      const card=fragment.querySelector(".athlete-card");

      el.athleteList.appendChild(fragment);

      const cards=[...el.athleteList.querySelectorAll(".athlete-card")];
      const newCard=cards[cards.length-1];

      newCard.querySelector(".athlete-name").value=defaults.name||"";
      newCard.querySelector(".journey").value=defaults.journey||"zero2hero";
      newCard.querySelector(".athlete-plan").value=defaults.plan||"standard";
      newCard.querySelector(".billing-term").value=defaults.billingTerm||"month-to-month";
      newCard.querySelector(".admissions-credit").value=defaults.credit??"25";
      newCard.querySelector(".renewal-behavior").value=defaults.renewalBehavior||"month-to-month";

      if(defaults.disciplines){
        defaults.disciplines.forEach(value=>{
          const box=newCard.querySelector(`.discipline[value="${value}"]`);
          if(box) box.checked=true;
        });
      }

      newCard.querySelector(".remove-athlete").addEventListener("click",()=>{
        if(el.athleteList.querySelectorAll(".athlete-card").length===1) return;
        newCard.remove();
        refreshAthleteTitles();
        calculate();
      });

      newCard.querySelectorAll("input,select").forEach(control=>{
        control.addEventListener("input",calculate);
        control.addEventListener("change",calculate);
      });

      refreshAthleteTitles();
      calculate();
    }

    function refreshAthleteTitles(){
      [...el.athleteList.querySelectorAll(".athlete-card")].forEach((card,index)=>{
        card.querySelector(".athlete-title").textContent=`Athlete ${index+1}`;
      });
    }

    function readAthletes(){
      return [...el.athleteList.querySelectorAll(".athlete-card")].map((card,index)=>{
        const disciplines=[...card.querySelectorAll(".discipline:checked")].map(x=>x.value);

        return{
          index:index+1,
          name:card.querySelector(".athlete-name").value.trim()||`Athlete ${index+1}`,
          journey:card.querySelector(".journey").value,
          plan:card.querySelector(".athlete-plan").value,
          billingTerm:card.querySelector(".billing-term").value,
          renewalBehavior:card.querySelector(".renewal-behavior").value,
          credit:Number(card.querySelector(".admissions-credit").value||0),
          disciplines
        };
      });
    }

    function calculate(){
      const athletes=readAthletes();
      const extra=extras[el.extra.value];
      const support=Math.max(0,Number(el.support.value)||0);
      const monthlySponsor=Math.max(0,Number(el.monthlySponsor.value)||0);
      const annualSponsor=Math.max(0,Number(el.annualSponsor.value)||0);

      let registrationCount=0;
      let admissionsCredits=0;
      let fitnessCount=0;
      let unlimitedCount=0;
      let standardCount=0;

      athletes.forEach(a=>{
        if(a.plan==="fitness"){
          fitnessCount+=1;
        }else{
          registrationCount+=a.disciplines.length;
          admissionsCredits+=a.credit;
          if(a.plan==="unlimited") unlimitedCount+=1;
          if(a.plan==="standard") standardCount+=1;
        }
      });

      const enrollmentBase=registrationCount*100;
      const annualBase=registrationCount*100;

      let monthlyBase=0;
      let commitmentDiscount=0;

      if(standardCount>0){
        monthlyBase+=familyMonthly[Math.min(standardCount,4)]||160+(standardCount-4)*20;
      }

      monthlyBase+=unlimitedCount*120;
      monthlyBase+=fitnessCount*60;

      const annualStandardAthletes=athletes.filter(a =>
        a.plan==="standard" && a.billingTerm==="annual"
      ).length;

      const annualUnlimitedAthletes=athletes.filter(a =>
        a.plan==="unlimited" && a.billingTerm==="annual"
      ).length;

      const annualFitnessAthletes=athletes.filter(a =>
        a.plan==="fitness" && a.billingTerm==="annual"
      ).length;

      if(annualStandardAthletes>0){
        commitmentDiscount+=10;
      }

      commitmentDiscount+=annualUnlimitedAthletes*10;
      commitmentDiscount+=annualFitnessAthletes*5;

      let privatePromo=0;
      if(el.privatePromo.checked&&extra.promoEligible){
        privatePromo=10;
      }

      let fitnessCredit=0;
      if(el.fitnessCredit.checked&&fitnessCount>0){
        fitnessCredit=15;
      }

      const dueNow=Math.max(
        0,
        enrollmentBase+
        extra.amount-
        admissionsCredits-
        privatePromo-
        fitnessCredit-
        support
      );

      const monthlyBalance=Math.max(
        0,
        monthlyBase-commitmentDiscount-monthlySponsor
      );

      const annualRenewal=Math.max(0,annualBase-annualSponsor);
      const firstYear=Math.max(
        0,
        dueNow+
        monthlyBalance*12+
        annualRenewal
      );

      el.dueNow.textContent=money(dueNow);
      el.monthlyTotal.textContent=money(monthlyBalance);
      el.firstYearTotal.textContent=money(firstYear);
      el.annualTotal.textContent=money(annualRenewal);

      el.standardCompare.textContent=
        `${money(familyMonthly[Math.min(Math.max(athletes.length,1),4)]||160)} / month`;

      el.unlimitedCompare.textContent=
        `${money(athletes.length*120)} / month`;

      el.breakdown.innerHTML="";

      athletes.forEach(a=>{
        if(a.plan==="fitness"){
          el.breakdown.append(line(`${a.name} — Fitness monthly`,60));
        }else{
          if(a.disciplines.length===0){
            el.breakdown.append(line(`${a.name} — No discipline selected`,0));
          }else{
            el.breakdown.append(line(
              `${a.name} — ${a.disciplines.length} registration${a.disciplines.length===1?"":"s"}`,
              a.disciplines.length*100
            ));
          }
        }
      });

      if(extra.amount>0){
        el.breakdown.append(line(extra.label,extra.amount));
      }

      if(admissionsCredits>0){
        el.breakdown.append(line("Admissions credits",admissionsCredits,{credit:true}));
      }

      if(privatePromo>0){
        el.breakdown.append(line("Private-session promotion",privatePromo,{credit:true}));
      }

      if(fitnessCredit>0){
        el.breakdown.append(line("Fitness drop-in credit",fitnessCredit,{credit:true}));
      }

      if(support>0){
        el.breakdown.append(line("Approved enrollment support",support,{credit:true}));
      }

      el.breakdown.append(line("Due at enrollment",dueNow,{total:true}));

      const d1=document.createElement("div");
      d1.className="divider";
      el.breakdown.append(d1);

      el.breakdown.append(line("Base monthly membership",monthlyBase));

      if(commitmentDiscount>0){
        el.breakdown.append(
          line(
            "12-month agreement adjustment",
            commitmentDiscount,
            {credit:true}
          )
        );
      }

      if(monthlySponsor>0){
        el.breakdown.append(line("Monthly sponsor support",monthlySponsor,{credit:true}));
      }

      el.breakdown.append(line("Monthly family balance",monthlyBalance,{total:true}));

      const d2=document.createElement("div");
      d2.className="divider";
      el.breakdown.append(d2);

      el.breakdown.append(line("Annual registration renewal",annualBase));

      if(annualSponsor>0){
        el.breakdown.append(line("Annual sponsor support",annualSponsor,{credit:true}));
      }

      el.breakdown.append(line("Annual renewal estimate",annualRenewal,{total:true}));

      const familyName=el.familyName.value.trim();
      const intro=familyName?`<p><strong>${familyName}</strong></p>`:"";

      const athleteText=athletes.map(a=>{
        const planLabel={
          standard:"Standard",
          unlimited:"Unlimited",
          fitness:"Fitness"
        }[a.plan];

        const disciplineText=
          a.plan==="fitness"
            ?"fitness lane"
            :a.disciplines.length
              ?a.disciplines.join(", ")
              :"no discipline selected";

        const termLabel =
          a.billingTerm==="annual"
            ? "12-month agreement"
            : "month-to-month";

        return `${a.name}: ${planLabel} — ${disciplineText} — ${termLabel}`;
      }).join("<br>");

      const recommendation=el.coachRecommendation.value.trim();

      el.summary.innerHTML=`
        ${intro}
        <p>${athleteText}</p>
        <p>
          Enrollment balance: <strong>${money(dueNow)}</strong>.
          Monthly family balance: <strong>${money(monthlyBalance)}</strong>.
          Projected first-year total: <strong>${money(firstYear)}</strong>.
          Next annual renewal: <strong>${money(annualRenewal)}</strong>.
          12-month agreement savings:
          <strong>${money(commitmentDiscount*12)}</strong> per year.
        </p>
        ${recommendation?`<p><strong>Coach recommendation:</strong> ${recommendation}</p>`:""}
      `;
    }

    function reset(){
      el.familyName.value="";
      el.coachName.value="Coach Sandoval";
      el.coachRecommendation.value="";
      el.extra.value="none";
      el.support.value="0";
      el.privatePromo.checked=false;
      el.fitnessCredit.checked=false;
      el.monthlySponsor.value="0";
      el.annualSponsor.value="0";
      el.athleteList.innerHTML="";
      addAthlete({disciplines:["wrestling"]});
    }

    el.addAthlete.addEventListener("click",()=>addAthlete());
    el.printButton.addEventListener("click",()=>window.print());
    el.resetButton.addEventListener("click",reset);

    [
      el.familyName,
      el.coachName,
      el.coachRecommendation,
      el.extra,
      el.support,
      el.privatePromo,
      el.fitnessCredit,
      el.monthlySponsor,
      el.annualSponsor
    ].forEach(control=>{
      control.addEventListener("input",calculate);
      control.addEventListener("change",calculate);
    });

    addAthlete({disciplines:["wrestling"]});
