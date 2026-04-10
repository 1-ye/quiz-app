# -*- coding: utf-8 -*-
import openpyxl
import json
import os
import re
from datetime import datetime, timedelta

desktop = os.path.join(os.environ['USERPROFILE'], 'Desktop')

# Find the copy file (副本) with updated answers
files = [f for f in os.listdir(desktop) if '商用密码' in f and f.endswith('.xlsx')]
source_file = None
for f in files:
    if '20260310' in f:
        source_file = f
        break
if not source_file:
    source_file = files[0]

print(f"Loading: {source_file}")
wb = openpyxl.load_workbook(os.path.join(desktop, source_file))
ws = wb.active

def convert_cell_value(val):
    """Convert cell value to string, handling Excel date serial numbers."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        # Check if it looks like an Excel date serial number (common range)
        # Excel dates: 1 = 1900-1-1, typical range for years 1999-2026: ~36161-46388
        if 30000 <= val <= 50000 and val == int(val):
            try:
                # Excel date serial: day 1 = 1900-01-01, but Excel has a bug treating 1900 as leap year
                base_date = datetime(1899, 12, 30)
                date_val = base_date + timedelta(days=int(val))
                return date_val.strftime('%Y年%m月%d日')
            except Exception:
                pass
    # Handle datetime objects directly
    if isinstance(val, datetime):
        return val.strftime('%Y年%m月%d日')
    return str(val)

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

    # FIX: Use "is not None" instead of truthy check, so 0 values are preserved
    options = []
    if opt_a is not None:
        options.append({"key": "A", "text": convert_cell_value(opt_a)})
    if opt_b is not None:
        options.append({"key": "B", "text": convert_cell_value(opt_b)})
    if opt_c is not None:
        options.append({"key": "C", "text": convert_cell_value(opt_c)})
    if opt_d is not None:
        options.append({"key": "D", "text": convert_cell_value(opt_d)})

    # Determine type code
    q_type_str = str(q_type) if q_type else ""
    if '多' in q_type_str:
        type_code = 'multi'
    elif '判断' in q_type_str:
        type_code = 'judge'
    else:
        type_code = 'single'

    # Normalize answer format
    ans_str = str(answer).strip() if answer else ""

    # Handle judgment answers: 正确 -> A, 错误 -> B
    if type_code == 'judge':
        if '正确' in ans_str or ans_str == '对':
            ans_str = 'A'
        elif '错误' in ans_str or ans_str == '错':
            ans_str = 'B'

    # Clean up multi-choice answer separators
    # Remove all separators: commas, spaces, 、 etc. Keep only letters
    ans_clean = re.sub(r'[^A-Da-d]', '', ans_str)
    ans_clean = ans_clean.upper()

    # Sort letters for consistency
    if len(ans_clean) > 1:
        ans_clean = ''.join(sorted(set(ans_clean)))

    # Fallback: if cleaning removed everything, use original
    if not ans_clean:
        ans_clean = ans_str

    # Convert question text - handle potential datetime in question
    q_text_str = convert_cell_value(q_text) if q_text else ""
    
    # Convert analysis
    analysis_str = ""
    if analysis and str(analysis) != 'None':
        analysis_str = convert_cell_value(analysis)

    questions.append({
        "id": int(q_id) if q_id else r - 2,
        "type": type_code,
        "typeName": q_type_str if q_type_str else "",
        "question": q_text_str,
        "options": options,
        "answer": ans_clean,
        "analysis": analysis_str
    })

# Write as JS
with open(r'd:\code_test\quiz-app\questions.js', 'w', encoding='utf-8') as f:
    f.write('const QUESTIONS = ')
    json.dump(questions, f, ensure_ascii=False, indent=None)
    f.write(';\n')

single_count = sum(1 for q in questions if q['type'] == 'single')
multi_count = sum(1 for q in questions if q['type'] == 'multi')
judge_count = sum(1 for q in questions if q['type'] == 'judge')

print(f"Converted {len(questions)} questions to questions.js")
print(f"Types: single={single_count}, multi={multi_count}, judge={judge_count}")

# Verify: check questions with option A = "0"
zero_a = [q for q in questions if any(o['key'] == 'A' and o['text'] == '0' for o in q['options'])]
print(f"Questions with A='0': {len(zero_a)}")
if zero_a:
    q = zero_a[0]
    print(f"  Sample: id={q['id']}, options={q['options']}, answer={q['answer']}")

# Verify: check for date-like values in options
date_opts = [q for q in questions if any('年' in o['text'] and '月' in o['text'] for o in q['options'])]
print(f"Questions with date options: {len(date_opts)}")
if date_opts:
    q = date_opts[0]
    print(f"  Sample: id={q['id']}, q={q['question'][:50]}, options={[o['text'] for o in q['options']]}")

# Verify: check judgment answers
judge_answers = {}
for q in questions:
    if q['type'] == 'judge':
        judge_answers[q['answer']] = judge_answers.get(q['answer'], 0) + 1
print(f"Judgment answers: {judge_answers}")
