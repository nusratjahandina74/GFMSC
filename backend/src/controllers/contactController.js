import { Resend } from "resend";

export const sendContactMessage = async (req, res) => {
  try {
    const { schoolName, name, phone, email, message } = req.body;

    if (!schoolName || !phone || !message) {
      return res.status(400).json({ message: "School name, phone and message required" });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    // Falls back to a fixed destination if CONTACT_TO isn't configured in
    // the deployment's environment — this way "Send Message" on the
    // landing page works out of the box without requiring extra Render
    // config, while still being overridable via env var later.
    const CONTACT_TO = process.env.CONTACT_TO || "ictgbsks@gmail.com";
    const RESEND_FROM = process.env.RESEND_FROM;

    if (!RESEND_API_KEY || !CONTACT_TO || !RESEND_FROM) {
      return res.status(500).json({
        message: "Mail config missing (RESEND_API_KEY / CONTACT_TO / RESEND_FROM)",
      });
    }

    const resend = new Resend(RESEND_API_KEY);

    await resend.emails.send({
      from: RESEND_FROM,
      to: [CONTACT_TO],
      subject: "New Contact Message",
      html: `
        <h3>New Contact Request</h3>
        <p><b>School:</b> ${schoolName}</p>
        <p><b>Name:</b> ${name || "-"}</p>
        <p><b>Phone:</b> ${phone}</p>
        <p><b>Email:</b> ${email || "-"}</p>
        <p><b>Message:</b><br/>${message}</p>
      `,
    });

    return res.status(200).json({ message: "Message sent successfully" });
  } catch (error) {
    console.error("MAIL ERROR:", error);
    return res.status(500).json({ message: error?.message || "Mail send failed" });
  }
};
