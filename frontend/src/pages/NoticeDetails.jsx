import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { getNotice } from "../api/notices";
import "../styles/notice.css";

export default function NoticeDetails() {
  const { id } = useParams();
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNotice = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const res = await getNotice(id);
        setNotice(res);
      } catch (err) {
        console.error("Failed to load notice:", err);
        setError(err?.response?.data?.message || err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchNotice();
  }, [id]);

  if (loading) {
    return (
      <div className="noticeWrap">
        <div className="noticeCard">
          <Link to="/notices" className="noticeBack">← Back to Notices</Link>
          <h2 className="noticeTitle">Loading...</h2>
        </div>
      </div>
    );
  }

  if (error || !notice) {
    return (
      <div className="noticeWrap">
        <div className="noticeCard">
          <Link to="/notices" className="noticeBack">← Back to Notices</Link>
          <h2 className="noticeTitle">Notice not found</h2>
          {error && <div className="noticeBody">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="noticeWrap">
      <div className="noticeCard">
        <Link to="/notices" className="noticeBack">← Back to Notices</Link>
        <h2 className="noticeTitle">{notice.title}</h2>
        <div className="noticeMeta">{new Date(notice.publishDate || notice.createdAt).toLocaleString()}</div>
        <div className="noticeBody" style={{ whiteSpace: "pre-wrap" }}>{notice.body}</div>
      </div>
    </div>
  );
}
