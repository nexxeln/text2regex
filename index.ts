import fs from "node:fs";
import { z } from "zod";
import { generateText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { $ } from "bun";

const generateTestCases = async (prompt: string): Promise<string> => {
  const result = await generateText({
    model: openai("gpt-4o"),
    tools: {
      createFile: tool({
        description: "Create a file",
        parameters: z.object({
          code: z.string().describe("The code to write to the file"),
        }),
        execute: async ({ code }) => {
          fs.writeFileSync("regex_test.py", code);
        },
      }),
    },
    system: `You are an expert designed to generate a complete Python test program for regular expressions based on natural language descriptions. Your task is to create a comprehensive set of test cases and the surrounding test program structure, leaving a placeholder for the actual regex pattern.

    When presented with a user's description of a desired regex pattern, follow these guidelines:
    
    1. Create at least 5 positive test cases (strings that should match the pattern).
    2. Create at least 5 negative test cases (strings that should not match the pattern).
    3. Include edge cases and boundary conditions in your test cases.
    4. Consider common mistakes or misunderstandings that might occur when implementing the regex.
    5. Provide a brief explanation for each test case as a comment.
    
    Your output should be a complete Python script using the \`unittest\` framework, structured as follows:
    
    \`\`\`python
    import unittest
    import re
    
    class RegexTest(unittest.TestCase):
        def setUp(self):
            # The actual regex pattern will be replaced here
            self.regex_pattern = r"YOUR_REGEX_PATTERN_HERE"
            self.pattern = re.compile(self.regex_pattern)
    
        def test_positive_cases(self):
            positive_cases = [
                ("test_string1", "explanation for why this should match"),
                ("test_string2", "explanation for why this should match"),
                # Add more positive test cases here
            ]
            for test_string, explanation in positive_cases:
                with self.subTest(test_string=test_string):
                    self.assertTrue(self.pattern.match(test_string), f"Should match: {explanation}")
    
        def test_negative_cases(self):
            negative_cases = [
                ("test_string1", "explanation for why this should not match"),
                ("test_string2", "explanation for why this should not match"),
                # Add more negative test cases here
            ]
            for test_string, explanation in negative_cases:
                with self.subTest(test_string=test_string):
                    self.assertFalse(self.pattern.match(test_string), f"Should not match: {explanation}")
    
    if __name__ == '__main__':
        unittest.main()
    \`\`\`
    
    Remember:
    - Be thorough and creative in your test case generation.
    - Ensure your test cases cover a wide range of possibilities.
    - Keep in mind the specific requirements mentioned in the user's description.
    - If the user's description is ambiguous, generate test cases for multiple interpretations and note the ambiguity.
    - Ensure all test cases are valid Python strings.
    - Do not implement the actual regex pattern; use the placeholder "YOUR_REGEX_PATTERN_HERE".
    - Output the code in a file named "regex_test.py". Use the createFile tool provided to you to create the file.`,

    prompt: `Generate test cases for the following prompt: ${prompt}`,
  });

  return result.text;
};

const generateRegex = async (
  userPrompt: string,
  testCases: string,
  testResults: string
): Promise<string> => {
  const result = await generateText({
    model: openai("gpt-4o"),
    prompt: `Based on the following user prompt and Python test cases, generate a regex pattern that matches all positive cases and none of the negative cases. If any tests failed, use the provided test results to refine the pattern:
    
    User Prompt: ${userPrompt}
    
    \`\`\`python
    ${testCases}
    \`\`\`
    
    Test Results:
    ${testResults}
    
    Your response should be the regex pattern only, without any additional text. Don't include it in a code block, just the pattern.`,
  });

  return result.text.trim();
};

const runTests = async (): Promise<string> => {
  try {
    const result = await $`python3 regex_test.py`.text();
    return result;
  } catch (err: any) {
    return err.stderr.toString();
  }
};

const updateRegexPattern = (filePath: string, newPattern: string): void => {
  let content = fs.readFileSync(filePath, "utf-8");
  const regex = /self\.regex_pattern\s*=\s*r".*"/;
  content = content.replace(regex, `self.regex_pattern = r"${newPattern}"`);
  fs.writeFileSync(filePath, content, "utf-8");
};

const userPrompt = process.argv[2];
console.log("Generating tests");
const testCases = await generateTestCases(userPrompt);

let attempts = 0;
const maxAttempts = 10;
let success = false;

while (attempts < maxAttempts && !success) {
  attempts += 1;
  let testResults = "This is the initial try, so no test results yet.";

  if (attempts > 1) {
    testResults = await runTests();
  }

  const regexPattern = await generateRegex(userPrompt, testCases, testResults);

  updateRegexPattern("regex_test.py", regexPattern);

  const newTestResults = await runTests();
  success = !newTestResults.includes("FAILED");
  console.log(`Attempt ${attempts}: ${success ? "Success" : "Failed"}`);
  console.log(`Test Results: ${newTestResults}`);

  if (success) {
    console.log("Successfully generated regex pattern:", regexPattern);
  }
}

if (!success) {
  console.log(
    "Failed to generate a working regex pattern within the maximum number of attempts."
  );
}

// Delete the python file after the program ends
fs.unlinkSync("regex_test.py");
