function updateNeeds(currentNeeds = {}, utterance = "") {
  const text = String(utterance).toLowerCase().trim();
  const next = {
    budgetTarget: currentNeeds.budgetTarget ?? null,
    lines: currentNeeds.lines ?? 1,
    usage: Array.isArray(currentNeeds.usage) ? [...currentNeeds.usage] : [],
    priorities: Array.isArray(currentNeeds.priorities) ? [...currentNeeds.priorities] : [],
    osPreference: currentNeeds.osPreference || "Any",
    wantsNewPhone: currentNeeds.wantsNewPhone ?? null,
    phoneBudget: currentNeeds.phoneBudget ?? null
  };

  const phoneBudgetMatch = text.match(
    /(?:(?:phone|device)\s+(?:monthly\s+)?budget|budget\s+for\s+(?:a\s+)?(?:new\s+)?(?:phone|device))[^\d$]{0,20}\$?\s*(\d+(?:\.\d+)?)/i
  );
  if (phoneBudgetMatch) next.phoneBudget = Number(phoneBudgetMatch[1]);

  const totalBudgetMatch = text.match(
    /(?:total|overall|monthly)\s+(?:monthly\s+)?budget[^\d$]{0,20}\$?\s*(\d+(?:\.\d+)?)/i
  );
  const mentionsSeparatePhoneBudget = /(?:(?:phone|device)\s+(?:monthly\s+)?budget|budget\s+for\s+(?:a\s+)?(?:new\s+)?(?:phone|device))/i.test(text);
  const budgetMatch = text.match(
    /(?:budget|spend|pay|under|less than|no more than|around|about|down to)[^\d$]{0,20}\$?\s*(\d+(?:\.\d+)?)/i
  );
  const amount = totalBudgetMatch?.[1] || (!mentionsSeparatePhoneBudget ? budgetMatch?.[1] : null);
  const lowersBudget = /(?:don't want to spend|do not want to spend|too much|too expensive|cheaper|lower my budget|less expensive)/i.test(text);
  if (amount && Number.isFinite(Number(amount))) {
    next.budgetTarget = Number(amount);
  } else if (lowersBudget && next.budgetTarget !== null) {
    next.budgetTarget = null;
  }

  const linesMatch = text.match(/\b(\d+)\s*(?:phone\s*)?(?:lines|people|family members)\b/i);
  const wordLinesMatch = text.match(/\b(one|two|three|four)\s+lines?\b/i);
  const wordPeopleMatch = text.match(/\b(one|two|three|four)\s+(?:people|family members)\b/i);
  const lineWords = { one: 1, two: 2, three: 3, four: 4 };
  if (linesMatch) next.lines = Math.max(1, Number(linesMatch[1]));
  else if (wordLinesMatch || wordPeopleMatch) next.lines = lineWords[(wordLinesMatch || wordPeopleMatch)[1]];
  if (/just me|only one line|one line/i.test(text)) next.lines = 1;

  if (/iphone|ios|apple phone/i.test(text)) next.osPreference = "iOS";
  else if (/android|galaxy|pixel phone/i.test(text)) next.osPreference = "Android";
  else if (/any phone|either platform|no preference/i.test(text)) next.osPreference = "Any";

  if (/keep my current phone|keep my existing phone|(?:don't|do not)\s+(?:need|want)\s+(?:a\s+)?(?:new\s+)?(?:(?:android|iphone|galaxy|pixel)\s+)?phone|no new phone/i.test(text)) {
    next.wantsNewPhone = false;
  } else if (/want (?:a )?(?:new )?(?:(?:android|iphone|galaxy|pixel) )?phone|need (?:a )?(?:new )?(?:(?:android|iphone|galaxy|pixel) )?phone|upgrade my phone|looking for (?:a )?new phone/i.test(text)) {
    next.wantsNewPhone = true;
  }

  const usageRules = [
    [/photo|camera|photography/i, "photo"],
    [/video|streaming|youtube|netflix/i, "video"],
    [/social media|instagram|tiktok/i, "social_media"],
    [/battery|long battery life/i, "battery"],
    [/hotspot|tethering/i, "hotspot"],
    [/everyday|calls and texts|basic use/i, "everyday_use"]
  ];
  for (const [pattern, value] of usageRules) {
    if (pattern.test(text) && !next.usage.includes(value)) next.usage.push(value);
  }
  if (/don't care about the camera|camera is not important/i.test(text)) {
    next.usage = next.usage.filter((value) => value !== "photo");
  }

  if (/budget|afford|cheap|low cost|lower my bill/i.test(text) && !next.priorities.includes("budget_conscious")) {
    next.priorities.push("budget_conscious");
  }

  return next;
}

module.exports = { updateNeeds };
