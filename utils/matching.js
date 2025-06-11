function parse_resume(resume_text) {
    const skills = extract_skills(resume_text);
    const experience = extract_experience(resume_text);
    return { skills, experience };
}

function calculate_match(user_survey, user_resume) {
    const skills_match_score = compare_skills(user_survey.skills, user_resume.skills);
    const experience_match_score = compare_experience(user_survey.experience, user_resume.experience);
    const location_match_score = compare_location(user_survey.location, user_resume.location);

    const total_match_score = (skills_match_score + experience_match_score + location_match_score) / 3;
    return total_match_score;
}

function suggest_jobs(user_profile, job_list) {
    const recommendations = [];
    for (const job of job_list) {
        const match_score = calculate_match(user_profile.survey, user_profile.resume);
        recommendations.push({ job, match_score });
    }
    return recommendations.sort((a, b) => b.match_score - a.match_score);
}

module.exports = {
    parse_resume,
    calculate_match,
    suggest_jobs
};
