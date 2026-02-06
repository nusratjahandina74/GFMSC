import { Link, useParams } from "react-router-dom";

const posts = {
  "1": { title: "How to improve student performance", date: "02 Feb 2026", body: "Full blog content here..." },
  "2": { title: "Why digital attendance saves time", date: "29 Jan 2026", body: "Full blog content here..." },
  "3": { title: "Exam preparation guide", date: "20 Jan 2026", body: "Full blog content here..." },
};

export default function BlogDetails() {
  const { id } = useParams();
  const p = posts[id];

  if (!p) return <div style={{ padding: 16 }}>Blog not found</div>;

  return (
    <div style={{ maxWidth: 900, margin: "30px auto", padding: 16, fontFamily: "Poppins, sans-serif" }}>
      <Link to="/blog">← Back</Link>
      <h2 style={{ marginTop: 12 }}>{p.title}</h2>
      <div style={{ color: "#666" }}>{p.date}</div>
      <p style={{ marginTop: 12, lineHeight: 1.7 }}>{p.body}</p>
    </div>
  );
}
