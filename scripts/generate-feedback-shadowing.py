import json

data_raw = [
    # 1-25 Beginner
    ("praising work", "You did a great job.", "Bạn đã làm rất tốt.", "statement", ["praise", "beginner"]),
    ("asking for feedback", "How is my work?", "Công việc của tôi thế nào?", "question", ["feedback", "question"]),
    ("praising work", "I like your idea.", "Tôi thích ý tưởng của bạn.", "statement", ["praise", "idea"]),
    ("asking for feedback", "Please check my report.", "Làm ơn kiểm tra báo cáo của tôi.", "request", ["report", "feedback"]),
    ("gentle criticism", "This needs more work.", "Cái này cần làm thêm.", "statement", ["criticism", "improvement"]),
    ("praising work", "You are very helpful.", "Bạn rất có ích.", "statement", ["praise", "helpful"]),
    ("asking for feedback", "Can you help me?", "Bạn có thể giúp tôi không?", "question", ["help", "feedback"]),
    ("accepting criticism", "I agree with you.", "Tôi đồng ý với bạn.", "statement", ["agreement", "feedback"]),
    ("accepting criticism", "I understand your point.", "Tôi hiểu ý của bạn.", "statement", ["understanding", "feedback"]),
    ("praising work", "Good work on this.", "Làm tốt lắm.", "exclamation", ["praise", "task"]),
    ("setting goals", "Let's set a goal.", "Hãy đặt ra một mục tiêu.", "request", ["goal", "planning"]),
    ("follow-up", "Check the results again.", "Kiểm tra lại kết quả.", "request", ["follow-up", "results"]),
    ("accepting criticism", "I will try harder.", "Tôi sẽ cố gắng hơn.", "statement", ["commitment", "improvement"]),
    ("gentle criticism", "This is not right.", "Cái này không đúng.", "statement", ["criticism", "error"]),
    ("follow-up", "Is this okay now?", "Thế này đã ổn chưa?", "question", ["follow-up", "check"]),
    ("praising work", "Great effort today!", "Hôm nay nỗ lực rất tốt!", "exclamation", ["praise", "effort"]),
    ("asking for feedback", "I need your advice.", "Tôi cần lời khuyên của bạn.", "statement", ["advice", "feedback"]),
    ("praising work", "That was very fast.", "Cái đó rất nhanh.", "statement", ["praise", "speed"]),
    ("gentle criticism", "Please fix this error.", "Làm ơn sửa lỗi này.", "request", ["criticism", "error"]),
    ("follow-up", "Let's meet tomorrow.", "Hãy gặp nhau vào ngày mai.", "request", ["meeting", "follow-up"]),
    ("praising work", "Keep up the work.", "Tiếp tục phát huy nhé.", "request", ["praise", "encouragement"]),
    ("setting goals", "I want to learn.", "Tôi muốn học hỏi.", "statement", ["learning", "goal"]),
    ("asking for feedback", "Tell me the truth.", "Hãy nói cho tôi sự thật.", "request", ["honesty", "feedback"]),
    ("praising work", "You are doing well.", "Bạn đang làm tốt.", "statement", ["praise", "progress"]),
    ("accepting criticism", "Thanks for the tips.", "Cảm ơn vì những lời khuyên.", "statement", ["gratitude", "feedback"]),

    # 26-50 Elementary
    ("praising work", "Your presentation was very clear and easy to follow.", "Bài thuyết trình của bạn rất rõ ràng và dễ theo dõi.", "statement", ["presentation", "clear"]),
    ("setting goals", "I think we should focus on the main goal.", "Tôi nghĩ chúng ta nên tập trung vào mục tiêu chính.", "statement", ["focus", "goal"]),
    ("asking for feedback", "Could you give me some feedback on my project?", "Bạn có thể cho tôi một chút phản hồi về dự án của tôi không?", "question", ["feedback", "project"]),
    ("accepting criticism", "I really appreciate the feedback you gave me earlier.", "Tôi thực sự trân trọng phản hồi mà bạn đã dành cho tôi lúc nãy.", "statement", ["appreciation", "feedback"]),
    ("gentle criticism", "Maybe you should try a different approach next time.", "Có lẽ bạn nên thử một cách tiếp cận khác vào lần tới.", "statement", ["approach", "suggestion"]),
    ("performance reviews", "Let's review your performance for the last three months.", "Hãy cùng xem xét hiệu suất của bạn trong ba tháng qua.", "request", ["review", "performance"]),
    ("disagreeing with feedback", "I disagree with some points in your recent report.", "Tôi không đồng ý với một số điểm trong báo cáo gần đây của bạn.", "statement", ["disagree", "report"]),
    ("setting goals", "We need to improve our communication within the team.", "Chúng ta cần cải thiện sự giao tiếp trong nhóm.", "statement", ["communication", "team"]),
    ("asking for feedback", "How can I improve my skills for this role?", "Làm thế nào tôi có thể cải thiện kỹ năng cho vị trí này?", "question", ["skills", "improvement"]),
    ("praising work", "You handled the difficult client very professionally today.", "Bạn đã xử lý khách hàng khó tính rất chuyên nghiệp vào hôm nay.", "statement", ["client", "professional"]),
    ("accepting criticism", "I will make sure to correct these mistakes immediately.", "Tôi sẽ đảm bảo sửa những lỗi này ngay lập tức.", "statement", ["mistakes", "correction"]),
    ("follow-up", "Can we schedule a follow-up meeting for next week?", "Chúng ta có thể lên lịch một cuộc họp tiếp theo vào tuần tới không?", "question", ["schedule", "meeting"]),
    ("praising work", "Your attention to detail is truly impressive, well done!", "Sự chú ý đến chi tiết của bạn thực sự ấn tượng, làm tốt lắm!", "exclamation", ["detail", "impressive"]),
    ("disagreeing with feedback", "I don't think that is the best way forward.", "Tôi không nghĩ đó là cách tốt nhất để tiến lên.", "statement", ["disagree", "opinion"]),
    ("setting goals", "We should aim to finish this by Friday afternoon.", "Chúng ta nên đặt mục tiêu hoàn thành việc này trước chiều thứ Sáu.", "statement", ["deadline", "goal"]),
    ("asking for feedback", "Could you explain why you feel that way?", "Bạn có thể giải thích tại sao bạn lại cảm thấy như vậy không?", "question", ["explanation", "feeling"]),
    ("accepting criticism", "I appreciate your honesty regarding my recent performance.", "Tôi trân trọng sự trung thực của bạn về hiệu suất gần đây của tôi.", "statement", ["honesty", "performance"]),
    ("follow-up", "Let's look at the data before we decide anything.", "Hãy nhìn vào dữ liệu trước khi chúng ta quyết định bất cứ điều gì.", "request", ["data", "decision"]),
    ("gentle criticism", "You missed a few important details in the summary.", "Bạn đã bỏ lỡ một vài chi tiết quan trọng trong bản tóm tắt.", "statement", ["missed", "details"]),
    ("praising work", "I am happy with your progress so far this year.", "Tôi hài lòng với tiến độ của bạn từ đầu năm đến nay.", "statement", ["happy", "progress"]),
    ("setting goals", "What are your main goals for the next quarter?", "Mục tiêu chính của bạn cho quý tới là gì?", "question", ["quarter", "goals"]),
    ("gentle criticism", "I have some concerns about the current project timeline.", "Tôi có một số lo ngại về tiến độ dự án hiện tại.", "statement", ["concerns", "timeline"]),
    ("accepting criticism", "Thank you for pointing out where I can improve.", "Cảm ơn vì đã chỉ ra những điểm tôi có thể cải thiện.", "statement", ["pointing", "improve"]),
    ("disagreeing with feedback", "I believe my results show a different story here.", "Tôi tin rằng kết quả của mình cho thấy một câu chuyện khác ở đây.", "statement", ["results", "story"]),
    ("follow-up", "Let's check back in a few days to see progress.", "Hãy kiểm tra lại sau vài ngày nữa để xem tiến độ.", "request", ["check", "progress"]),

    # 51-75 Intermediate
    ("performance reviews", "I would like to discuss how we can improve our team's overall efficiency.", "Tôi muốn thảo luận về cách chúng ta có thể cải thiện hiệu quả tổng thể của nhóm.", "statement", ["efficiency", "team"]),
    ("disagreeing with feedback", "Although I see your point, I believe my method is more effective here.", "Mặc dù tôi hiểu ý bạn, tôi tin rằng phương pháp của tôi hiệu quả hơn ở đây.", "statement", ["method", "effective"]),
    ("praising work", "You have consistently met all your targets, which is a very positive sign.", "Bạn đã liên tục đạt được tất cả các mục tiêu, đó là một dấu hiệu rất tích cực.", "statement", ["targets", "positive"]),
    ("asking for feedback", "Could you provide more specific examples of what I need to change?", "Bạn có thể đưa ra những ví dụ cụ thể hơn về những gì tôi cần thay đổi không?", "question", ["specific", "examples"]),
    ("gentle criticism", "I suggest focusing on your time management skills to increase your daily output.", "Tôi khuyên bạn nên tập trung vào kỹ năng quản lý thời gian để tăng năng suất hàng ngày.", "statement", ["time", "output"]),
    ("setting goals", "Let's set some clear objectives for your professional development over the next year.", "Hãy đặt ra một số mục tiêu rõ ràng cho sự phát triển chuyên môn của bạn trong năm tới.", "request", ["objectives", "development"]),
    ("accepting criticism", "I appreciate the constructive criticism and will work on these areas right away.", "Tôi trân trọng những lời phê bình mang tính xây dựng và sẽ cải thiện ngay lập tức.", "statement", ["constructive", "areas"]),
    ("gentle criticism", "It seems there was a misunderstanding regarding the requirements for this specific task.", "Có vẻ như đã có sự hiểu lầm về các yêu cầu cho nhiệm vụ cụ thể này.", "statement", ["misunderstanding", "requirements"]),
    ("praising work", "I am very impressed with how you managed the budget for this project.", "Tôi rất ấn tượng với cách bạn quản lý ngân sách cho dự án này.", "statement", ["budget", "impressed"]),
    ("follow-up", "Can we have a quick chat about the feedback I received yesterday?", "Chúng ta có thể trò chuyện nhanh về phản hồi mà tôi đã nhận được hôm qua không?", "question", ["chat", "yesterday"]),
    ("disagreeing with feedback", "I feel that my contributions to the team haven't been fully recognized lately.", "Tôi cảm thấy rằng những đóng góp của mình cho nhóm chưa được ghi nhận đầy đủ gần đây.", "statement", ["contributions", "recognized"]),
    ("gentle criticism", "You should try to be more proactive when dealing with potential technical issues.", "Bạn nên cố gắng chủ động hơn khi đối phó với các vấn đề kỹ thuật tiềm ẩn.", "statement", ["proactive", "technical"]),
    ("follow-up", "I would like to receive regular updates on your progress with these tasks.", "Tôi muốn nhận được các bản cập nhật thường xuyên về tiến độ của bạn với những nhiệm vụ này.", "statement", ["updates", "regular"]),
    ("praising work", "Your ability to work under pressure is a great asset to our department.", "Khả năng làm việc dưới áp lực của bạn là một tài sản lớn cho bộ phận của chúng ta.", "statement", ["pressure", "asset"]),
    ("setting goals", "I think we need to rethink our strategy for reaching new customers.", "Tôi nghĩ chúng ta cần suy nghĩ lại về chiến lược tiếp cận khách hàng mới.", "statement", ["strategy", "customers"]),
    ("accepting criticism", "Thank you for your guidance; it has helped me understand the process better.", "Cảm ơn sự hướng dẫn của bạn; nó đã giúp tôi hiểu quy trình tốt hơn.", "statement", ["guidance", "process"]),
    ("disagreeing with feedback", "I don't quite agree with the assessment of my leadership style in this review.", "Tôi không hoàn toàn đồng ý với đánh giá về phong cách lãnh đạo của mình trong bản đánh giá này.", "statement", ["assessment", "leadership"]),
    ("asking for feedback", "How do you think I can better support the team in the future?", "Bạn nghĩ tôi có thể hỗ trợ nhóm tốt hơn như thế nào trong tương lai?", "question", ["support", "future"]),
    ("performance reviews", "You've shown great improvement in your technical skills since our last review meeting.", "Bạn đã cho thấy sự cải thiện lớn về kỹ năng kỹ thuật kể từ cuộc họp đánh giá trước.", "statement", ["improvement", "review"]),
    ("follow-up", "Let's schedule a time to go over the final results of the campaign.", "Hãy sắp xếp thời gian để xem qua kết quả cuối cùng của chiến dịch.", "request", ["results", "campaign"]),
    ("asking for feedback", "I would appreciate it if you could be more specific about my weaknesses.", "Tôi sẽ rất cảm kích nếu bạn có thể cụ thể hơn về những điểm yếu của tôi.", "statement", ["specific", "weaknesses"]),
    ("setting goals", "We need to establish a more consistent workflow to avoid these recurring delays.", "Chúng ta cần thiết lập một quy trình làm việc nhất quán hơn để tránh những sự chậm trễ lặp lại này.", "statement", ["workflow", "delays"]),
    ("disagreeing with feedback", "I value your input, but I think we should stick to the original plan.", "Tôi trân trọng ý kiến của bạn, nhưng tôi nghĩ chúng ta nên bám sát kế hoạch ban đầu.", "statement", ["input", "original"]),
    ("praising work", "Excellent work on the presentation; the stakeholders were very impressed with the data.", "Làm tốt lắm trong bài thuyết trình; các bên liên quan rất ấn tượng với dữ liệu.", "exclamation", ["stakeholders", "data"]),
    ("accepting criticism", "I'll take your suggestions into account when I start the next phase.", "Tôi sẽ xem xét các gợi ý của bạn khi tôi bắt đầu giai đoạn tiếp theo.", "statement", ["suggestions", "phase"]),

    # 76-100 Advanced
    ("disagreeing with feedback", "While I respect your opinion, I strongly feel that my performance during this period warrants a higher rating than this.", "Mặc dù tôi tôn trọng ý kiến của bạn, tôi thực sự cảm thấy hiệu suất của mình trong giai đoạn này xứng đáng được đánh giá cao hơn thế này.", "statement", ["warrants", "rating"]),
    ("performance reviews", "I would like to request a formal review of my responsibilities to ensure they align with my current career path.", "Tôi muốn yêu cầu một cuộc đánh giá chính thức về các trách nhiệm của mình để đảm bảo chúng phù hợp với con đường sự nghiệp hiện tại.", "statement", ["responsibilities", "align"]),
    ("praising work", "Your exceptional leadership during the recent crisis was instrumental in maintaining team morale and achieving our critical project milestones.", "Sự lãnh đạo xuất sắc của bạn trong cuộc khủng hoảng gần đây là yếu tố quan trọng trong việc duy trì tinh thần đồng đội và đạt được các cột mốc quan trọng của dự án.", "statement", ["instrumental", "milestones"]),
    ("asking for feedback", "Could you please clarify how these performance metrics are calculated so I can better understand where I need to focus?", "Bạn có thể vui lòng làm rõ cách các chỉ số hiệu suất này được tính toán để tôi có thể hiểu rõ hơn nơi mình cần tập trung không?", "question", ["metrics", "calculate"]),
    ("gentle criticism", "It appears that some of your recent deliverables have not met the quality standards we established at the beginning of the year.", "Có vẻ như một số sản phẩm bàn giao gần đây của bạn đã không đáp ứng được các tiêu chuẩn chất lượng mà chúng ta đã thiết lập vào đầu năm.", "statement", ["deliverables", "standards"]),
    ("accepting criticism", "I am committed to improving my communication skills and will enroll in a professional workshop as per your helpful suggestion.", "Tôi cam kết cải thiện kỹ năng giao tiếp của mình và sẽ đăng ký một hội thảo chuyên môn theo gợi ý hữu ích của bạn.", "statement", ["committed", "workshop"]),
    ("setting goals", "Let's collaborate to define a set of measurable goals that will challenge you and contribute to our long-term strategic vision.", "Hãy cùng cộng tác để xác định một tập hợp các mục tiêu có thể đo lường được, những mục tiêu này sẽ thử thách bạn và đóng góp vào tầm nhìn chiến lược dài hạn của chúng ta.", "request", ["measurable", "vision"]),
    ("accepting criticism", "I appreciate you bringing these issues to my attention, and I will conduct a thorough investigation to identify the root cause.", "Tôi trân trọng việc bạn đã lưu ý tôi về những vấn đề này, và tôi sẽ tiến hành một cuộc điều tra kỹ lưỡng để xác định nguyên nhân gốc rễ.", "statement", ["investigation", "root"]),
    ("accepting criticism", "Although the feedback was tough to hear, I recognize its validity and am determined to turn these weaknesses into future strengths.", "Mặc dù phản hồi hơi khó nghe, tôi công nhận tính đúng đắn của nó và quyết tâm biến những điểm yếu này thành thế mạnh trong tương lai.", "statement", ["validity", "weaknesses"]),
    ("follow-up", "I would like to follow up on our previous discussion regarding the potential for my promotion within the next six months.", "Tôi muốn theo dõi cuộc thảo luận trước đây của chúng ta về khả năng thăng tiến của tôi trong vòng sáu tháng tới.", "statement", ["potential", "promotion"]),
    ("praising work", "Your innovative approach to problem-solving has significantly reduced our operational costs and improved our service delivery times across the board.", "Cách tiếp cận đổi mới của bạn trong việc giải quyết vấn đề đã làm giảm đáng kể chi phí vận hành và cải thiện thời gian cung cấp dịch vụ của chúng ta trên mọi phương diện.", "statement", ["innovative", "operational"]),
    ("disagreeing with feedback", "I feel that the current workload is becoming unmanageable and would like to discuss how we can redistribute some tasks.", "Tôi cảm thấy khối lượng công việc hiện tại đang trở nên không thể quản lý được và muốn thảo luận về cách chúng ta có thể phân bổ lại một số nhiệm vụ.", "statement", ["workload", "unmanageable"]),
    ("follow-up", "Can we arrange a session to brainstorm how we can incorporate this feedback into our standard operating procedures going forward?", "Chúng ta có thể sắp xếp một buổi thảo luận để lên ý tưởng về cách kết hợp phản hồi này vào quy trình hoạt động tiêu chuẩn của chúng ta trong tương lai không?", "question", ["brainstorm", "procedures"]),
    ("gentle criticism", "I am concerned that the lack of clear direction is hindering the team's ability to meet our quarterly performance targets.", "Tôi lo ngại rằng việc thiếu định hướng rõ ràng đang cản trở khả năng của nhóm trong việc đạt được các mục tiêu hiệu suất hàng quý.", "statement", ["hindering", "quarterly"]),
    ("accepting criticism", "Thank you for providing such detailed feedback; it gives me a very clear roadmap for what I need to achieve.", "Cảm ơn bạn đã cung cấp phản hồi chi tiết như vậy; nó cho tôi một lộ trình rất rõ ràng về những gì tôi cần đạt được.", "statement", ["detailed", "roadmap"]),
    ("performance reviews", "I believe that my recent accomplishments demonstrate a level of seniority that isn't currently reflected in my job title or compensation.", "Tôi tin rằng những thành tựu gần đây của mình chứng minh một mức độ thâm niên hiện không được phản ánh trong chức danh công việc hoặc mức lương của tôi.", "statement", ["accomplishments", "seniority"]),
    ("setting goals", "We should establish a mentoring program to help junior staff members improve their technical proficiency and gain more confidence in their roles.", "Chúng ta nên thiết lập một chương trình cố vấn để giúp các nhân viên cấp dưới cải thiện trình độ kỹ thuật và có thêm tự tin trong vai trò của họ.", "statement", ["mentoring", "proficiency"]),
    ("disagreeing with feedback", "I respectfully disagree with the claim that I haven't been meeting my deadlines, as the logs show otherwise for every project.", "Tôi xin trân trọng không đồng ý với tuyên bố rằng tôi đã không đáp ứng các thời hạn, vì các nhật ký cho thấy điều ngược lại đối với mọi dự án.", "statement", ["respectfully", "deadlines"]),
    ("praising work", "Your dedication to excellence and your willingness to mentor others have made a significant impact on the culture of our team.", "Sự cống hiến của bạn cho sự xuất sắc và sự sẵn lòng cố vấn cho người khác đã tạo ra một tác động đáng kể đến văn hóa của nhóm chúng ta.", "statement", ["dedication", "culture"]),
    ("asking for feedback", "I would welcome the opportunity to discuss my performance in more detail to ensure that I am exceeding your expectations.", "Tôi hoan nghênh cơ hội để thảo luận chi tiết hơn về hiệu suất của mình để đảm bảo rằng tôi đang vượt quá mong đợi của bạn.", "statement", ["opportunity", "expectations"]),
    ("gentle criticism", "It is important that we address these performance issues immediately to prevent them from affecting the overall success of the project.", "Điều quan trọng là chúng ta phải giải quyết các vấn đề hiệu suất này ngay lập tức để ngăn chúng ảnh hưởng đến thành công tổng thể của dự án.", "statement", ["address", "prevent"]),
    ("accepting criticism", "I will implement the changes you suggested and provide you with a status update by the end of next week.", "Tôi sẽ thực hiện các thay đổi mà bạn đã gợi ý và cung cấp cho bạn một bản cập nhật trạng thái vào cuối tuần tới.", "statement", ["implement", "status"]),
    ("setting goals", "Let's set a recurring meeting to review our progress against these goals and make any necessary adjustments to our current strategy.", "Hãy thiết lập một cuộc họp định kỳ để xem xét tiến độ của chúng ta so với những mục tiêu này và thực hiện bất kỳ điều chỉnh cần thiết nào cho chiến lược hiện tại của chúng ta.", "request", ["recurring", "adjustments"]),
    ("disagreeing with feedback", "I appreciate your honesty, but I think there are some external factors that weren't considered in this evaluation of my performance.", "Tôi trân trọng sự trung thực của bạn, nhưng tôi nghĩ có một số yếu tố bên ngoài đã không được xem xét trong bản đánh giá hiệu suất này của tôi.", "statement", ["factors", "evaluation"]),
    ("praising work", "Your contribution to the project was vital, and your ability to coordinate between departments ensured that we met our deadline successfully.", "Đóng góp của bạn cho dự án là rất quan trọng, và khả năng phối hợp giữa các bộ phận của bạn đã đảm bảo rằng chúng ta đã đạt được thời hạn thành công.", "statement", ["vital", "coordinate"]),
]

def generate_sentence_obj(i, cat, text, trans, stype, tags):
    level = "beginner"
    diff = 1
    if 26 <= i <= 50:
        level = "elementary"
        diff = 2
    elif 51 <= i <= 75:
        level = "intermediate"
        diff = 3
    elif 76 <= i <= 100:
        level = "advanced"
        diff = 4
    
    # Natural form for common reductions
    natural_form = ""
    if "did a" in text.lower():
        natural_form = text.replace("did a", "did'a")
    elif "you are" in text.lower():
        natural_form = text.replace("You are", "You're").replace("you are", "you're")
    elif "I am" in text.lower():
        natural_form = text.replace("I am", "I'm").replace("i am", "i'm")
    elif "want to" in text.lower():
        natural_form = text.replace("want to", "wanna")
    elif "going to" in text.lower():
        natural_form = text.replace("going to", "gonna")

    # Vocab selection based on tags
    vocab = []
    for tag in tags:
        if tag == "praise": vocab.append({"word": "praise", "meaning": "khen ngợi"})
        elif tag == "feedback": vocab.append({"word": "feedback", "meaning": "phản hồi"})
        elif tag == "report": vocab.append({"word": "report", "meaning": "báo cáo"})
        elif tag == "improvement": vocab.append({"word": "improvement", "meaning": "sự cải thiện"})
        elif tag == "goal": vocab.append({"word": "goal", "meaning": "mục tiêu"})
        elif tag == "results": vocab.append({"word": "results", "meaning": "kết quả"})
        elif tag == "presentation": vocab.append({"word": "presentation", "meaning": "bài thuyết trình"})
        elif tag == "professional": vocab.append({"word": "professionally", "meaning": "một cách chuyên nghiệp"})
        elif tag == "efficiency": vocab.append({"word": "efficiency", "meaning": "hiệu quả"})
        elif tag == "measurable": vocab.append({"word": "measurable", "meaning": "có thể đo lường"})
        elif tag == "instrumental": vocab.append({"word": "instrumental", "meaning": "góp phần quan trọng"})
    
    if not vocab:
        vocab = [{"word": tags[0], "meaning": "từ khóa liên quan"}]

    return {
        "subcategory": cat,
        "level": level,
        "difficulty": diff,
        "sentence_type": stype,
        "sentence": text,
        "natural_form": natural_form,
        "translation": trans,
        "accent": "american",
        "pronunciation_focus": f"Clear articulation of {tags[0]}",
        "stress_focus": "Content words like nouns and verbs",
        "intonation_focus": "rising" if stype == "question" else "falling",
        "connected_speech_focus": "Word linking and reductions" if natural_form else "Standard word linking",
        "vocabulary": vocab,
        "grammar_focus": f"{stype.capitalize()} structure in {level} context",
        "tags": tags + [level, cat.replace(' ', '_')]
    }

sentences = []
for i, data in enumerate(data_raw, 1):
    sentences.append(generate_sentence_obj(i, *data))

output = {
    "slug": "feedback-performance",
    "name": "Giving & Receiving Feedback",
    "topic_group": "Work & Professional English",
    "blurb": "Master the art of giving and receiving professional feedback to excel in your career.",
    "sort_order": 34,
    "sentences": sentences
}

import os

output_path = os.path.join(os.path.dirname(__file__), 'seed', 'shadowing', 'feedback-performance.json')
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
