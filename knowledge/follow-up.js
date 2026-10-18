function createFollowUp({
  customerName, action, customerPriorities = [], recommendedPlan = null,
  contactPreference = null, contactPermissionConfirmed = false
}) {
  const channel = contactPreference === "sms" || contactPreference === "message" ? "message" : "email";
  let subject = "Following up on your options";
  let message = `Hi ${customerName || "there"},\n\n`;

  if (action.type === "offer_lower_cost_option") {
    subject = "A lower-cost option to consider";
    message += "Based on our conversation, I can prepare an option that better fits your priorities.";
    if (recommendedPlan) message += ` One option to review is ${recommendedPlan}.`;
    message += "\n\nWould you like me to send you a comparison?";
  } else if (action.type === "prepare_plan_comparison") {
    subject = "Comparing your options";
    message += "I can prepare a clear comparison of the options we discussed so you can review their costs and features.\n\nWould that be helpful?";
  } else if (action.type === "send_personalized_recap") {
    subject = "A recap of your options";
    message += "I wanted to share a concise recap of the options we discussed so you can review them when convenient.\n\nLet me know if you would like to revisit any details.";
  } else if (action.type === "confirm_next_step") {
    subject = "Confirming our next step";
    message += "I wanted to confirm the next step we discussed. Please let me know if anything has changed.";
  } else {
    message += "I can help clarify the options we discussed. Please let me know which details you would like to review.";
  }

  return {
    channel,
    channelReason: contactPreference === "sms" || contactPreference === "message"
      ? "The recorded contact preference is SMS/message. Confirm the channel is appropriate before contacting."
      : "Email is the default draft channel; confirm that it is appropriate before contacting.",
    subject: channel === "email" ? subject : null,
    message,
    personalizationEvidence: customerPriorities,
    contactPermissionConfirmed: contactPermissionConfirmed === true,
    requiresSellerApproval: true,
    sendStatus: "draft"
  };
}

module.exports = { createFollowUp };
