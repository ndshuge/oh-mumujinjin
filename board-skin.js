/* V5 board art adapter. No game state, input, coordinates or rule changes. */
(() => {
  "use strict";
  const original = HTMLCanvasElement.prototype.getContext;
  const colors = new Map(Object.entries({
    "#101c2b":"#f2f6f2","#395164":"#d8e6dc",
    "#43382f":"#f4dfb5","#1e4147":"#c6ead8",
    "#1c3041":"#dbe9e2","#223649":"#cbded4",
    "#846345":"#e9c787","#467a7b":"#a5d5ba","#33495c":"#dce7df",
    "#ffba67":"#ffdc98","#9df2e2":"#a3e5bf",
    "#cd9b60":"#a87836","#7aadae":"#548f71",
    "#627c91":"#92aca1","#657c90":"#92aca1",
    "#536671":"#849a94","#75919a":"#9fb2aa",
    "#283947":"#607871","#3f5a65":"#6d8980",
    "#8eb2b5":"#c6d7cb","#9dc4c4":"#cbdcd0",
    "#a2a3ef":"#9cc8e4","#414967":"#d5eaf5",
    "#a9bce6":"#89bad8","#e0e1fb":"#4b8cb8",
    "#6e4a32":"#f4c46e","#1d5154":"#86cda9",
    "#ffd18e":"#865821","#a0e9d9":"#256e56",
    "#f1a64d":"#e6af52","#62cabb":"#5dbd91",
    "#ffd08d":"#f8c768","#75dfd3":"#80d7a9",
    "#ffcf85":"#fff2d4","#a5f6e6":"#f5fff8",
    "#edb56d":"#e8a753","#80dccb":"#4dae79",
    "#ffca85":"#e6ad56","#9de9d9":"#6ab998",
    "#73d3c6":"#62ba90","#f4b967":"#e8b25b",
    "#0d1620":"#a4b6ac","#ffffff42":"#ffffff8a",
    "#0b1424af":"#1d403e9c","#0a1629df":"#eef8f0ed",
    "#9d8d66":"#d5e6d4","#f6c180":"#b27b38","#9ce8dc":"#3c9677"
  }));
  function remap(value) {
    if (typeof value !== "string") return value;
    const key = value.toLowerCase();
    if (colors.has(key)) return colors.get(key);
    if (key === "#f7b65a35") return "#eeb95560";
    if (key === "#72dace35") return "#62bc8a60";
    if (key === "#ed7777") return "#ed817c";
    return value;
  }
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const ctx = original.call(this,type,...args);
    if (type !== "2d" || this.id !== "board" || !ctx) return ctx;
    if (this.__mumuSkinContext) return this.__mumuSkinContext;
    const override = new Proxy(ctx, {
      get(target,key) {
        const v = Reflect.get(target,key,target);
        if (key === "fillText") return function(value,x,y,...rest) {
          if(value === "金" || value === "木") {
            target.save();
            const oldFont = target.font;
            const size = /(\d+(?:\.\d+)?)px/.exec(oldFont);
            const px = size ? Number(size[1]) : 20;
            target.font = "900 " + px + "px 'Arial Rounded MT Bold','PingFang SC','Microsoft YaHei',sans-serif";
            target.lineJoin = "round";
            target.lineWidth = Math.max(1.2,px*.09);
            target.strokeStyle = target.fillStyle;
            target.strokeText(value,x,y,...rest);
            target.fillText(value,x,y,...rest);
            target.restore();
            return;
          }
          return target.fillText(value,x,y,...rest);
        };
        return typeof v === "function" ? v.bind(target) : v;
      },
      set(target,key,value) {
        if(key === "fillStyle" || key === "strokeStyle" || key === "shadowColor") {
          return Reflect.set(target,key,remap(value),target);
        }
        return Reflect.set(target,key,value,target);
      }
    });
    this.__mumuSkinContext = override;
    return override;
  };
})();