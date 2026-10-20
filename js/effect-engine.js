/* Card effect text parser for the development build only. */
(function (root) {
  "use strict";

  const TRIGGERS = {
    enter: ["場に出た時", "場に出たとき"],
    start: ["自分のターン開始時", "自分のターンの開始時"],
    end: ["自分のターン終了時", "自分のターンの終了時"],
    opponentStart: ["相手のターン開始時", "相手のターンの開始時"],
    opponentEnd: ["相手のターン終了時", "相手のターンの終了時"],
    destroy: ["破壊時", "破壊された時", "破壊されたとき"],
    attack: ["攻撃時", "攻撃した時", "攻撃したとき"]
  };

  function splitAbilities(text) {
    const source = String(text || "");
    if (!source.trim()) return [];
    return source.split("。")
      .map((part, index, all) => (part.trim() ? part.trim() + (index < all.length - 1 ? "。" : "") : ""))
      .filter(Boolean)
      .map((raw, index) => {
        const costMatch = raw.match(/^\s*\((\d+)\)\s*/);
        const cost = costMatch ? Number(costMatch[1]) : null;
        const body = costMatch ? raw.slice(costMatch[0].length).trim() : raw.trim();
        let trigger = null;
        for (const [name, phrases] of Object.entries(TRIGGERS)) {
          if (phrases.some(phrase => body.includes(phrase))) {
            trigger = name;
            break;
          }
        }
        return { index, raw, body, cost, trigger };
      });
  }

  function forTrigger(text, trigger) {
    return splitAbilities(text).filter(ability => ability.trigger === trigger && ability.cost === null);
  }

  function immediateAbilities(text) {
    return splitAbilities(text).filter(ability => ability.cost === null && ability.trigger === null);
  }

  function activatedAbilities(text) {
    return splitAbilities(text).filter(ability => ability.cost !== null && ability.trigger === null);
  }

  root.CardEffectEngine = Object.freeze({
    splitAbilities,
    forTrigger,
    immediateAbilities,
    activatedAbilities,
    triggers: TRIGGERS
  });
})(globalThis);
