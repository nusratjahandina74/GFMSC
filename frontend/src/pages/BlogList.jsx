import { Link } from "react-router-dom";
import "../styles/notice.css"; // ✅ same design system reuse

const posts = [
  { id: "1", title: "How to improve student performance", date: "02 Feb 2026", excerpt: "Simple steps teachers and guardians can follow to support learning." },
  { id: "2", title: "Why digital attendance saves time", date: "29 Jan 2026", excerpt: "How a digital system reduces errors and makes reporting faster." },
  { id: "3", title: "Exam preparation guide", date: "20 Jan 2026", excerpt: "A practical checklist to help students prepare with confidence." },
];

export default function BlogList() {
  return (
    <div className="noticeWrap">
      <div className="noticeHeader">
        <div>
          <h2 className="noticePageTitle">Blog</h2>
          <p className="noticePageSub">News, tips, and updates for students, parents, and teachers.</p>
        </div>

        <Link to="/" className="noticeBtn">
          ← Back to Home
        </Link>
      </div>

      <div className="noticeGrid">
        {posts.map((p) => (
          <div key={p.id} className="noticeItem">
            <div className="noticeTagRow">
              <span className="noticeTag">Blog</span>
              <span className="noticeDate">{p.date}</span>
            </div>

            <div className="noticeItemTitle">{p.title}</div>
            <div className="noticeItemBody">{p.excerpt}</div>

            <div className="noticeActions">
              <Link className="noticeRead" to={`/blog/${p.id}`}>
                Read →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
