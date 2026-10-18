function extractNeeds(transcript = "") {
  const text = String(transcript).toLowerCase();

  const budgetMatch = text.match(
    /(?:budget|spend|pay|under|less than|no more than)[^\d$]{0,20}\$?\s*(\d+(?:\.\d+)?)/i
  );

  const budgetTarget = budgetMatch
    ? Number(budgetMatch[1])
    : undefined;

  const usage = [];

  if (/video|streaming|youtube|netflix/.test(text)) {
    usage.push("video");
  }

  if (/everyday|calls|text messages/.test(text)) {
    usage.push("everyday_use");
  }

  if (/photo|photos|picture|camera/.test(text)) usage.push("photo");
  if (/social media|instagram|tiktok/.test(text)) usage.push("social_media");
  if (/fold|foldable/.test(text)) usage.push("foldable_preference");
  if (/hotspot/.test(text)) usage.push("hotspot");
  if (/battery/.test(text)) usage.push("battery");

  const priorities = [];
  if (/budget|afford|cheap|low.cost|spend no more|under \$/.test(text)) {
    priorities.push("budget_conscious");
  }
  if (/camera|photo|photos|picture/.test(text)) priorities.push("photo");
  if (/performance|fast|power user/.test(text)) priorities.push("power_user");

  const lineMatch = text.match(/\b(\d+)\s*(?:phone\s*)?lines?\b/);
  const wordLineMatch = text.match(/\b(one|two|three|four)\s+lines?\b/);
  const lineWords = { one: 1, two: 2, three: 3, four: 4 };
  const lines = Math.max(
    1,
    Number(lineMatch?.[1]) || lineWords[wordLineMatch?.[1]] || 1
  );

  let osPreference;
  if (/iphone|ios/.test(text)) {
    osPreference = "iOS";
  } else if (/android|galaxy|pixel/.test(text)) {
    osPreference = "Android";
  }

  let wantsNewPhone;
  const phonePhrase = /(?:(?:new\s+)?(?:android|ios|iphone|galaxy|pixel)\s+)?phone|new\s+(?:iphone|android|galaxy|pixel)/;
  if ((/(?:don't|do not)\s+(?:need|want)\s+(?:a\s+)?/.test(text) && phonePhrase.test(text.replace(/^.*?(?:don't|do not)\s+(?:need|want)\s+(?:a\s+)?/, ""))) || /keep my current phone|no new phone|not looking for (?:a )?new phone/.test(text)) {
    wantsNewPhone = false;
  } else if (/(?:want|need)\s+(?:a\s+)?(?:new\s+)?(?:(?:android|ios|iphone|galaxy|pixel)\s+)?phone/.test(text) || /(?:want|need)\s+(?:a\s+)?new\s+(?:iphone|android|galaxy|pixel)/.test(text) || /upgrade my phone|looking for (?:a )?new phone/.test(text)) {
    wantsNewPhone = true;
  }

  return {
    budgetTarget,
    lines,
    usage,
    priorities,
    osPreference,
    wantsNewPhone
  };
}

module.exports = { extractNeeds };
