
---

# 6 dist/universal-ev-charger-card.js

```javascript
class UniversalEVChargerCard extends HTMLElement {

  setConfig(config){

    if(!config.entities){
      throw new Error("Entities must be defined");
    }

    this.config=config;

  }

  set hass(hass){

    this._hass=hass;

    if(!this.card){
      this.build();
    }

    this.update();

  }

  entity(name){

    if(!this.config.entities[name]) return null;

    return this._hass.states[this.config.entities[name]];

  }

  value(name){

    const e=this.entity(name);

    return e?e.state:"-";

  }

  call(domain,service,data){

    this._hass.callService(domain,service,data);

  }

  build(){

    const card=document.createElement("ha-card");

    card.innerHTML=`

    <div class="container">

      <div class="header">

        <div class="title">
          ${this.config.title||"EV Charger"}
        </div>

        <div class="power" id="power"></div>

      </div>

      <div class="soc">

        <svg viewBox="0 0 36 36">

          <path class="bg"
          d="M18 2.0845
          a 15.9155 15.9155 0 0 1 0 31.831
          a 15.9155 15.9155 0 0 1 0 -31.831"/>

          <path id="socArc"
          class="progress"
          stroke-dasharray="0,100"
          d="M18 2.0845
          a 15.9155 15.9155 0 0 1 0 31.831
          a 15.9155 15.9155 0 0 1 0 -31.831"/>

          <text x="18" y="20.5"
          class="socText"
          id="socText"></text>

        </svg>

      </div>

      <div class="stats">

        <div class="stat">
          ☀
          <span id="pv"></span>
          <small>PV</small>
        </div>

        <div class="stat">
          🔋
          <span id="energy"></span>
          <small>kWh</small>
        </div>

        <div class="stat">
          🔌
          <span id="phases"></span>
          <small>ph</small>
        </div>

      </div>

      <div class="controls">

        <button id="start">Start</button>
        <button id="stop">Stop</button>

      </div>

      <div class="slider">

        <label>
          Charge Current
          <span id="ampValue"></span>
        </label>

        <input id="ampSlider"
        type="range"
        min="6"
        max="32">

      </div>

      <div id="modeButtons" class="mode"></div>

    </div>
    `;

    this.appendChild(card);

    this.card=card;

    this.events();

    this.style();

  }

  update(){

    const power=this.value("power");
    const energy=this.value("energy");
    const soc=this.value("soc");
    const pv=this.value("pv_power");
    const phases=this.value("phases");

    this.querySelector("#power").innerText=power+" W";
    this.querySelector("#energy").innerText=energy;
    this.querySelector("#pv").innerText=pv;
    this.querySelector("#phases").innerText=phases;

    if(soc!="-"){

      const p=parseInt(soc);

      this.querySelector("#socArc")
        .setAttribute("stroke-dasharray",p+",100");

      this.querySelector("#socText")
        .innerText=p+"%";

    }

    const current=this.entity("current");

    if(current){

      const slider=this.querySelector("#ampSlider");

      slider.value=current.state;

      this.querySelector("#ampValue")
        .innerText=current.state+"A";

    }

  }

  events(){

    const charging=this.config.entities.charging;
    const current=this.config.entities.current;
    const mode=this.config.entities.mode;

    this.querySelector("#start").onclick=()=>{
      this.call("switch","turn_on",{entity_id:charging});
    };

    this.querySelector("#stop").onclick=()=>{
      this.call("switch","turn_off",{entity_id:charging});
    };

    const slider=this.querySelector("#ampSlider");

    slider.onchange=e=>{
      this.call("number","set_value",{
        entity_id:current,
        value:e.target.value
      });
    };

    if(mode){

      const entity=this._hass.states[mode];

      const container=this.querySelector("#modeButtons");

      entity.attributes.options.forEach(o=>{

        const b=document.createElement("button");

        b.innerText=o;

        b.onclick=()=>{

          this.call("select","select_option",{
            entity_id:mode,
            option:o
          });

        };

        container.appendChild(b);

      });

    }

  }

  style(){

    const style=document.createElement("style");

    style.textContent=`

    .container{
      padding:16px;
    }

    .header{
      display:flex;
      justify-content:space-between;
    }

    .power{
      font-size:28px;
      font-weight:bold;
    }

    .soc{
      width:90px;
      margin:auto;
    }

    svg{
      width:90px;
      height:90px;
    }

    .bg{
      fill:none;
      stroke:#eee;
      stroke-width:3.8;
    }

    .progress{
      fill:none;
      stroke:#4caf50;
      stroke-width:3.8;
      stroke-linecap:round;
    }

    .socText{
      text-anchor:middle;
      font-size:0.5em;
    }

    .stats{
      display:grid;
      grid-template-columns:repeat(3,1fr);
      margin-top:10px;
    }

    .stat{
      text-align:center;
    }

    .controls{
      display:flex;
      gap:10px;
      margin-top:10px;
    }

    button{
      flex:1;
      padding:10px;
      border:none;
      border-radius:10px;
      background:var(--primary-color);
      color:white;
    }

    .slider{
      margin-top:10px;
    }

    input[type=range]{
      width:100%;
    }

    .mode{
      margin-top:10px;
      display:flex;
      gap:6px;
    }

    .mode button{
      flex:1;
      font-size:12px;
    }

    `;

    this.appendChild(style);

  }

  getCardSize(){
    return 5;
  }

}

customElements.define(
  "universal-ev-charger-card",
  UniversalEVChargerCard
);
