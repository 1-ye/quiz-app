import openpyxl
import json

wb = openpyxl.load_workbook(r'C:\Users\admin\Desktop\新题库(带答案).xlsx')
ws = wb.active

questions = []
for r in range(3, ws.max_row + 1):
    q_id = ws.cell(r, 1).value
    q_type = ws.cell(r, 2).value
    q_text = ws.cell(r, 3).value
    opt_a = ws.cell(r, 4).value
    opt_b = ws.cell(r, 5).value
    opt_c = ws.cell(r, 6).value
    opt_d = ws.cell(r, 7).value
    answer = ws.cell(r, 8).value
    analysis = ws.cell(r, 9).value

    if not q_text:
        continue

    options = []
    if opt_a: options.append({"key": "A", "text": str(opt_a)})
    if opt_b: options.append({"key": "B", "text": str(opt_b)})
    if opt_c: options.append({"key": "C", "text": str(opt_c)})
    if opt_d: options.append({"key": "D", "text": str(opt_d)})

    # Determine type code
    if q_type and '多' in str(q_type):
        type_code = 'multi'
    elif q_type and '判断' in str(q_type):
        type_code = 'judge'
    else:
        type_code = 'single'

    questions.append({
        "id": int(q_id) if q_id else r - 2,
        "type": type_code,
        "typeName": str(q_type) if q_type else "",
        "question": str(q_text),
        "options": options,
        "answer": str(answer).strip() if answer else "",
        "analysis": str(analysis).strip() if analysis and str(analysis) != 'None' else ""
    })

# Write as JS
with open(r'd:\code_test\quiz-app\questions.js', 'w', encoding='utf-8') as f:
    f.write('const QUESTIONS = ')
    json.dump(questions, f, ensure_ascii=False, indent=None)
    f.write(';\n')

print(f"Converted {len(questions)} questions to questions.js")
print(f"Types: single={sum(1 for q in questions if q['type']=='single')}, multi={sum(1 for q in questions if q['type']=='multi')}, judge={sum(1 for q in questions if q['type']=='judge')}")
