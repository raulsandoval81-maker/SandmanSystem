const ENDPOINT =
"/testRecognitionQueue";

async function loadQueue(){

const res = await fetch(ENDPOINT);

const data = await res.json();

document.getElementById("stripeCount").textContent =
data.stripeAwards;

document.getElementById("certificateCount").textContent =
data.certificates;

document.getElementById("testingCount").textContent =
data.testing;

document.getElementById("promotionCount").textContent =
data.promotions;

document.getElementById("ceremonyCount").textContent =
data.ceremonies;

const queue=document.getElementById("queue");

queue.innerHTML="";

data.queue.stripeAwards.forEach(item=>{

queue.innerHTML+=`

<div class="queue-item">

<strong>${item.athleteName}</strong><br>

Tier ${item.decision.tier}
Stripe ${item.decision.stripe}

</div>

`;

});

}

loadQueue();