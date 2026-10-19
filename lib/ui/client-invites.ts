/** Share the same invite capability by link or WhatsApp. The phone is only a share destination. */
export const clientInviteShareText = (company: string, link: string) => `${company} invites you to Groundwork to raise and follow your requests: ${link}`;
export const clientInviteWhatsApp = (phone: string, company: string, link: string) =>
 `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(clientInviteShareText(company, link))}`;
