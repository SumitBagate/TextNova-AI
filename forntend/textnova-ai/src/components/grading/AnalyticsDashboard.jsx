import React, { useMemo } from "react";
import "./AnalyticsDashboard.css";

const AnalyticsDashboard = ({ results }) => {
  const analytics = useMemo(() => {
    if (!results || results.length === 0) {
      return {
        totalStudents: 0,
        classAverage: 0,
        highestScore: 0,
        lowestScore: 0,
        passCount: 0,
        failCount: 0,
      };
    }

    const marks = results.map((r) => r.totalMarks || 0);
    const percentages = results.map((r) => r.percentage || 0);

    const totalStudents = results.length;
    const classAverage = (
      percentages.reduce((a, b) => a + b, 0) / totalStudents
    ).toFixed(1);
    const highestScore = Math.max(...marks);
    const lowestScore = Math.min(...marks);
    const passCount = results.filter((r) => r.status === "pass").length;
    const failCount = results.filter((r) => r.status === "fail").length;

    return {
      totalStudents,
      classAverage,
      highestScore,
      lowestScore,
      passCount,
      failCount,
    };
  }, [results]);

  const cards = [
    {
      icon: "👥",
      label: "Total Students",
      value: analytics.totalStudents,
      color: "primary",
    },
    {
      icon: "📈",
      label: "Class Average",
      value: `${analytics.classAverage}%`,
      color: "secondary",
    },
    {
      icon: "🏆",
      label: "Highest Score",
      value: analytics.highestScore,
      color: "success",
    },
    {
      icon: "📊",
      label: "Lowest Score",
      value: analytics.lowestScore,
      color: "warning",
    },
    {
      icon: "✅",
      label: "Passed",
      value: analytics.passCount,
      color: "success",
    },
    {
      icon: "❌",
      label: "Failed",
      value: analytics.failCount,
      color: "danger",
    },
  ];

  return (
    <div className="analytics-dashboard">
      <h3>📊 Class Analytics</h3>
      <div className="analytics-grid">
        {cards.map((card, index) => (
          <div key={index} className={`analytics-card card-${card.color}`}>
            <div className="card-icon">{card.icon}</div>
            <div className="card-content">
              <p className="card-label">{card.label}</p>
              <p className="card-value">{card.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
