const fs = require("fs");
const path = require("path");

// The catalog lives at the repository root, one directory above knowledge/.
const dataPath = path.join(__dirname, "..", "tmobile_sales_agent_mock_data.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

function scoreMatch(item, usage = [], priorities = []) {
  const preferences = [...usage, ...priorities].map((value) =>
    String(value).toLowerCase()
  );
  const bestFor = (item.best_for || []).map((value) =>
    String(value).toLowerCase()
  );
  return preferences.reduce(
    (score, preference) => score + (bestFor.includes(preference) ? 3 : 0),
    0
  );
}

function recommend(needs = {}) {
  const lines = Math.max(1, Number(needs.lines) || 1);
  const budget = Number(needs.budgetTarget);
  const hasBudget =
    needs.budgetTarget !== undefined &&
    needs.budgetTarget !== null &&
    needs.budgetTarget !== "" &&
    Number.isFinite(budget);
  const usage = Array.isArray(needs.usage) ? needs.usage : [];
  const priorities = Array.isArray(needs.priorities) ? needs.priorities : [];
  const wantsNewPhone = needs.wantsNewPhone === true;
  const osPreference = String(needs.osPreference || "Any").toLowerCase();

  const eligiblePlans = data.plans.filter(
    (plan) => lines >= (plan.minimum_lines || 1)
  );
  const eligiblePhones = wantsNewPhone
    ? data.phones.filter(
        (phone) =>
          osPreference === "any" ||
          String(phone.os).toLowerCase() === osPreference
      )
    : [null];

  const combinations = [];
  for (const plan of eligiblePlans) {
    for (const phone of eligiblePhones) {
      const planMonthly = plan.mock_monthly_price_per_line * lines;
      const phoneMonthly = phone ? phone.mock_monthly_payment_24mo : 0;
      const totalMonthly = Number((planMonthly + phoneMonthly).toFixed(2));
      if (hasBudget && totalMonthly > budget) continue;

      combinations.push({
        plan: {
          id: plan.id,
          name: plan.name,
          monthlyPricePerLine: plan.mock_monthly_price_per_line,
          monthlyTotal: planMonthly,
          features: plan.features || [],
          tradeoffs: plan.tradeoffs || []
        },
        phone: phone
          ? {
              id: phone.id,
              brand: phone.brand,
              model: phone.model,
              retailPrice: phone.mock_retail_price,
              monthlyPayment: phone.mock_monthly_payment_24mo,
              features: phone.features || [],
              tradeoffs: phone.tradeoffs || []
            }
          : null,
        monthlyTotal: totalMonthly,
        score:
          scoreMatch(plan, usage, priorities) +
          (phone ? scoreMatch(phone, usage, priorities) : 0) +
          (hasBudget ? 2 : 0),
        reasons: [...new Set([
          ...(plan.best_for || []),
          ...(phone ? phone.best_for || [] : [])
        ])],
        tradeoffs: [...new Set([
          ...(plan.tradeoffs || []),
          ...(phone ? phone.tradeoffs || [] : [])
        ])]
      });
    }
  }

  combinations.sort(
    (a, b) => b.score - a.score || a.monthlyTotal - b.monthlyTotal
  );
  const recommendations = combinations
    .slice(0, 2)
    .map(({ score, ...item }) => item);

  return {
    status: recommendations.length ? "matched" : "no_match",
    needs: {
      budgetTarget: hasBudget ? budget : null,
      lines,
      usage,
      priorities,
      osPreference,
      wantsNewPhone
    },
    recommendations
  };
}

module.exports = { recommend };
