/**
 * atsKeywords.js — curated dictionary used by the ATS Resume Analyzer.
 *
 * Every entry:
 *   name     canonical display name
 *   type     language | framework | database | tool | cloud | concept | soft | domain | certification
 *   aliases  lower-case spellings that count as a match
 *   strict   (optional) alias is a common English word / single letter (C, R, Go, React, Express, Spring...).
 *            Strict aliases (written in their canonical case, e.g. 'React') match the exact-case token,
 *            or any-case when it sits next to a list separator (comma, slash, pipe, bullet, parenthesis).
 *            Aliases of <= 2 characters (C, R, Go) ALWAYS need a separator neighbour, so that
 *            "Plan A, B, C" style text or "go to market" does not produce false positives.
 *   related  (optional) canonical names of adjacent skills — used only to tell a candidate that a
 *            missing keyword is "close to" something they already have. Never used to inflate a score.
 *
 * The analyzer is deterministic: same text in, same result out.
 */

const T = {
  LANG: 'language',
  FW: 'framework',
  DB: 'database',
  TOOL: 'tool',
  CLOUD: 'cloud',
  CONCEPT: 'concept',
  SOFT: 'soft',
  DOMAIN: 'domain',
  CERT: 'certification',
};

// Non-strict entries are matched case-insensitively (aliases lower-cased). For strict entries the alias
// case is preserved: a lower-case alias is unambiguous ('express.js'), a capitalised one ('Express') is the
// ambiguous token that needs the case / separator rule described above.
const e = (name, type, aliases, extra = {}) => ({
  name,
  type,
  aliases: extra.strict ? aliases : aliases.map((a) => a.toLowerCase()),
  ...extra,
});

const ENTRIES = [
  // ---- Programming languages
  e('C', T.LANG, ['C'], { strict: true }),
  e('C++', T.LANG, ['c++', 'cpp'], { related: ['C'] }),
  e('C#', T.LANG, ['c#', 'c sharp', 'csharp'], { related: ['Java'] }),
  e('Java', T.LANG, ['java'], { related: ['Kotlin', 'C#'] }),
  e('Python', T.LANG, ['python', 'python3']),
  e('JavaScript', T.LANG, ['javascript', 'java script', 'ecmascript', 'es6'], { related: ['TypeScript'] }),
  e('TypeScript', T.LANG, ['typescript'], { related: ['JavaScript'] }),
  e('Go', T.LANG, ['golang', 'Go'], { strict: true }),
  e('Rust', T.LANG, ['Rust'], { strict: true }),
  e('R', T.LANG, ['R'], { strict: true }),
  e('Kotlin', T.LANG, ['kotlin'], { related: ['Java'] }),
  e('Swift', T.LANG, ['Swift'], { strict: true }),
  e('PHP', T.LANG, ['php']),
  e('Ruby', T.LANG, ['ruby']),
  e('Scala', T.LANG, ['scala']),
  e('Dart', T.LANG, ['dart']),
  e('SQL', T.LANG, ['sql', 'pl/sql', 'plsql', 't-sql'], { related: ['MySQL', 'PostgreSQL'] }),
  e('HTML', T.LANG, ['html', 'html5']),
  e('CSS', T.LANG, ['css', 'css3']),
  e('Bash', T.LANG, ['bash', 'shell scripting', 'shell script']),
  e('MATLAB', T.LANG, ['matlab']),

  // ---- Frameworks & libraries
  e('React', T.FW, ['react.js', 'reactjs', 'React'], { strict: true, related: ['JavaScript', 'Next.js', 'Angular', 'Vue.js'] }),
  e('Next.js', T.FW, ['next.js', 'nextjs'], { related: ['React'] }),
  e('Angular', T.FW, ['angular', 'angularjs'], { related: ['React', 'TypeScript'] }),
  e('Vue.js', T.FW, ['vue', 'vue.js', 'vuejs'], { related: ['React'] }),
  e('React Native', T.FW, ['react native'], { related: ['React'] }),
  e('Redux', T.FW, ['redux', 'redux toolkit'], { related: ['React'] }),
  e('Node.js', T.FW, ['node.js', 'nodejs', 'node js'], { related: ['JavaScript', 'Express.js'] }),
  e('Express.js', T.FW, ['express.js', 'expressjs', 'express js', 'Express'], { strict: true, related: ['Node.js'] }),
  e('NestJS', T.FW, ['nestjs', 'nest.js'], { related: ['Node.js', 'TypeScript'] }),
  e('Django', T.FW, ['django'], { related: ['Python', 'Flask'] }),
  e('Flask', T.FW, ['flask'], { related: ['Python', 'Django'] }),
  e('FastAPI', T.FW, ['fastapi'], { related: ['Python', 'Flask'] }),
  e('Spring Boot', T.FW, ['spring boot', 'springboot', 'spring framework', 'Spring'], { strict: true, related: ['Java'] }),
  e('.NET', T.FW, ['.net', 'asp.net', 'dotnet'], { related: ['C#'] }),
  e('Laravel', T.FW, ['laravel'], { related: ['PHP'] }),
  e('Tailwind CSS', T.FW, ['tailwind', 'tailwindcss', 'tailwind css'], { related: ['CSS'] }),
  e('Bootstrap', T.FW, ['bootstrap'], { related: ['CSS'] }),
  e('Material UI', T.FW, ['material ui', 'material-ui', 'mui'], { related: ['React'] }),
  e('jQuery', T.FW, ['jquery'], { related: ['JavaScript'] }),
  e('TensorFlow', T.FW, ['tensorflow'], { related: ['PyTorch', 'Python'] }),
  e('PyTorch', T.FW, ['pytorch'], { related: ['TensorFlow', 'Python'] }),
  e('Scikit-learn', T.FW, ['scikit-learn', 'scikit learn', 'sklearn'], { related: ['Python', 'Pandas'] }),
  e('Pandas', T.FW, ['pandas'], { related: ['NumPy', 'Python'] }),
  e('NumPy', T.FW, ['numpy'], { related: ['Pandas', 'Python'] }),
  e('Flutter', T.FW, ['flutter'], { related: ['Dart'] }),
  e('Socket.IO', T.FW, ['socket.io', 'socketio', 'websocket', 'websockets'], { related: ['Node.js'] }),
  e('Jest', T.FW, ['jest'], { related: ['JavaScript', 'Unit Testing'] }),
  e('JUnit', T.FW, ['junit'], { related: ['Java', 'Unit Testing'] }),
  e('Mongoose', T.FW, ['mongoose'], { related: ['MongoDB', 'Node.js'] }),

  // ---- More tools / frameworks
  e('Kafka', T.TOOL, ['kafka', 'apache kafka'], { related: ['RabbitMQ', 'Microservices'] }),
  e('RabbitMQ', T.TOOL, ['rabbitmq'], { related: ['Kafka'] }),
  e('Spark', T.TOOL, ['apache spark', 'pyspark', 'Spark'], { strict: true, related: ['Hadoop', 'Python'] }),
  e('Hadoop', T.TOOL, ['hadoop'], { related: ['Spark'] }),
  e('Airflow', T.TOOL, ['airflow'], { related: ['Python', 'Data Analysis'] }),
  e('Snowflake', T.TOOL, ['snowflake'], { related: ['SQL'] }),
  e('Ansible', T.TOOL, ['ansible'], { related: ['Terraform', 'DevOps'] }),
  e('Prometheus', T.TOOL, ['prometheus', 'grafana'], { related: ['DevOps'] }),
  e('Maven', T.TOOL, ['maven', 'gradle'], { related: ['Java'] }),
  e('Hibernate', T.FW, ['hibernate', 'jpa'], { related: ['Java', 'Spring Boot'] }),
  e('Cypress', T.FW, ['cypress', 'playwright'], { related: ['Selenium', 'Unit Testing'] }),
  e('Mocha', T.FW, ['mocha', 'chai', 'supertest'], { related: ['Jest', 'Node.js'] }),
  e('Prisma', T.FW, ['prisma', 'sequelize', 'typeorm', 'sqlalchemy'], { related: ['SQL'] }),
  e('Svelte', T.FW, ['svelte', 'sveltekit'], { related: ['React', 'Vue.js'] }),
  e('Sass', T.FW, ['sass', 'scss'], { related: ['CSS'] }),
  e('OpenCV', T.FW, ['opencv', 'computer vision'], { related: ['Python', 'Deep Learning'] }),
  e('Keras', T.FW, ['keras'], { related: ['TensorFlow', 'Deep Learning'] }),
  e('LangChain', T.FW, ['langchain', 'hugging face', 'huggingface', 'rag'], { related: ['NLP'] }),
  e('Supabase', T.DB, ['supabase'], { related: ['PostgreSQL', 'Firebase'] }),

  // ---- Databases
  e('MongoDB', T.DB, ['mongodb', 'mongo db', 'mongo'], { related: ['NoSQL', 'MySQL'] }),
  e('MySQL', T.DB, ['mysql'], { related: ['SQL', 'PostgreSQL'] }),
  e('PostgreSQL', T.DB, ['postgresql', 'postgres', 'psql'], { related: ['SQL', 'MySQL'] }),
  e('SQLite', T.DB, ['sqlite'], { related: ['SQL'] }),
  e('Oracle DB', T.DB, ['oracle db', 'oracle database', 'oracle sql'], { related: ['SQL'] }),
  e('Redis', T.DB, ['redis'], { related: ['MongoDB'] }),
  e('Firebase', T.DB, ['firebase', 'firestore'], { related: ['MongoDB'] }),
  e('DynamoDB', T.DB, ['dynamodb'], { related: ['MongoDB', 'AWS'] }),
  e('Elasticsearch', T.DB, ['elasticsearch', 'elastic search'], { related: ['MongoDB'] }),
  e('NoSQL', T.DB, ['nosql'], { related: ['MongoDB'] }),
  e('Cassandra', T.DB, ['cassandra'], { related: ['NoSQL'] }),

  // ---- Tools & platforms
  e('Git', T.TOOL, ['git']),
  e('GitHub', T.TOOL, ['github'], { related: ['Git'] }),
  e('GitLab', T.TOOL, ['gitlab'], { related: ['Git'] }),
  e('Docker', T.TOOL, ['docker', 'dockerfile', 'containerization'], { related: ['Kubernetes'] }),
  e('Kubernetes', T.TOOL, ['kubernetes', 'k8s'], { related: ['Docker'] }),
  e('Jenkins', T.TOOL, ['jenkins'], { related: ['CI/CD'] }),
  e('Postman', T.TOOL, ['postman'], { related: ['REST API'] }),
  e('Linux', T.TOOL, ['linux', 'unix', 'ubuntu'], { related: ['Bash'] }),
  e('VS Code', T.TOOL, ['vs code', 'vscode', 'visual studio code']),
  e('Jira', T.TOOL, ['jira']),
  e('Figma', T.TOOL, ['figma']),
  e('Webpack', T.TOOL, ['webpack'], { related: ['Vite'] }),
  e('Vite', T.TOOL, ['vite'], { related: ['Webpack'] }),
  e('npm', T.TOOL, ['npm', 'yarn', 'pnpm']),
  e('Terraform', T.TOOL, ['terraform'], { related: ['Docker', 'AWS'] }),
  e('Nginx', T.TOOL, ['nginx'], { related: ['Linux'] }),
  e('Swagger', T.TOOL, ['swagger', 'openapi'], { related: ['REST API'] }),
  e('Tableau', T.TOOL, ['tableau'], { related: ['Power BI'] }),
  e('Power BI', T.TOOL, ['power bi', 'powerbi'], { related: ['Tableau', 'Excel'] }),
  e('Excel', T.TOOL, ['microsoft excel', 'ms excel', 'advanced excel', 'Excel'], { strict: true, related: ['Power BI'] }),
  e('Jupyter', T.TOOL, ['jupyter', 'colab'], { related: ['Python'] }),
  e('Selenium', T.TOOL, ['selenium'], { related: ['Unit Testing'] }),
  e('Vercel', T.TOOL, ['vercel', 'netlify', 'render.com', 'heroku'], { related: ['Deployment'] }),

  // ---- Cloud
  e('AWS', T.CLOUD, ['aws', 'amazon web services', 'ec2', 's3'], { related: ['Azure', 'GCP', 'Docker'] }),
  e('Azure', T.CLOUD, ['azure', 'microsoft azure'], { related: ['AWS', 'GCP'] }),
  e('GCP', T.CLOUD, ['gcp', 'google cloud', 'google cloud platform'], { related: ['AWS', 'Azure'] }),
  e('Cloudinary', T.CLOUD, ['cloudinary'], { related: ['AWS'] }),

  // ---- Concepts / other technical skills
  e('Data Structures', T.CONCEPT, ['data structures', 'data structure', 'dsa', 'leetcode', 'codeforces', 'codechef', 'hackerrank', 'geeksforgeeks']),
  e('Algorithms', T.CONCEPT, ['algorithms', 'algorithm', 'dsa', 'competitive programming', 'leetcode', 'codeforces', 'codechef', 'hackerrank', 'geeksforgeeks'], { related: ['Data Structures'] }),
  e('OOP', T.CONCEPT, ['oop', 'oops', 'object oriented', 'object-oriented']),
  e('REST API', T.CONCEPT, ['rest api', 'rest apis', 'restful', 'restful api', 'restful apis'], { related: ['Node.js', 'Express.js'] }),
  e('GraphQL', T.CONCEPT, ['graphql'], { related: ['REST API'] }),
  e('Microservices', T.CONCEPT, ['microservices', 'microservice'], { related: ['REST API', 'Docker'] }),
  e('System Design', T.CONCEPT, ['system design', 'low level design', 'high level design', 'lld', 'hld'], { related: ['Data Structures'] }),
  e('DBMS', T.CONCEPT, ['dbms', 'database management', 'rdbms'], { related: ['SQL'] }),
  e('Operating Systems', T.CONCEPT, ['operating systems', 'operating system'], { related: ['Linux'] }),
  e('Computer Networks', T.CONCEPT, ['computer networks', 'computer networking', 'networking'], { related: ['Operating Systems'] }),
  e('CI/CD', T.CONCEPT, ['ci/cd', 'ci cd', 'continuous integration', 'continuous deployment', 'continuous delivery', 'github actions'], { related: ['Docker', 'Jenkins', 'Git'] }),
  e('DevOps', T.CONCEPT, ['devops'], { related: ['Docker', 'CI/CD'] }),
  e('Unit Testing', T.CONCEPT, ['unit testing', 'unit tests', 'test driven', 'tdd', 'integration testing', 'automated testing', 'test automation'], { related: ['Jest'] }),
  e('Authentication', T.CONCEPT, ['authentication', 'authorization', 'jwt', 'oauth', 'oauth2', 'json web token'], { related: ['Node.js'] }),
  e('Responsive Design', T.CONCEPT, ['responsive design', 'responsive', 'mobile-first', 'mobile first'], { related: ['CSS'] }),
  e('Machine Learning', T.CONCEPT, ['machine learning', 'ml'], { related: ['Python', 'Scikit-learn', 'Deep Learning'] }),
  e('Deep Learning', T.CONCEPT, ['deep learning', 'neural network', 'neural networks', 'cnn', 'rnn'], { related: ['Machine Learning', 'TensorFlow'] }),
  e('NLP', T.CONCEPT, ['nlp', 'natural language processing', 'llm', 'large language model', 'large language models', 'generative ai'], { related: ['Machine Learning'] }),
  e('Data Analysis', T.CONCEPT, ['data analysis', 'data analytics', 'data visualization', 'data visualisation', 'etl'], { related: ['SQL', 'Python', 'Pandas'] }),
  e('Web Development', T.CONCEPT, ['web development', 'web developer', 'full stack', 'full-stack', 'fullstack', 'frontend', 'front-end', 'front end', 'backend', 'back-end', 'back end', 'mern'], { related: ['JavaScript', 'React', 'Node.js'] }),
  e('MVC', T.CONCEPT, ['mvc', 'model view controller'], { related: ['OOP'] }),
  e('Deployment', T.CONCEPT, ['deployment', 'deployed', 'hosting'], { related: ['Docker', 'CI/CD'] }),
  e('API Development', T.CONCEPT, ['api development', 'api design', 'apis', 'api integration', 'third-party api', 'third party api'], { related: ['REST API'] }),
  e('Version Control', T.CONCEPT, ['version control', 'source control'], { related: ['Git'] }),
  e('Debugging', T.CONCEPT, ['debugging', 'troubleshooting'], {}),
  e('Design Patterns', T.CONCEPT, ['design patterns', 'design pattern', 'solid principles'], { related: ['OOP'] }),
  e('Cybersecurity', T.CONCEPT, ['cybersecurity', 'cyber security', 'information security', 'penetration testing', 'owasp'], {}),

  // ---- Soft skills
  e('Communication', T.SOFT, ['communication', 'communicate', 'presentation skills', 'verbal and written']),
  e('Teamwork', T.SOFT, ['teamwork', 'team player', 'team work', 'collaboration', 'collaborate', 'collaborative', 'cross-functional', 'cross functional']),
  e('Leadership', T.SOFT, ['leadership', 'led a team', 'team lead', 'lead a team', 'mentoring', 'mentored', 'mentor']),
  e('Problem Solving', T.SOFT, ['problem solving', 'problem-solving', 'analytical', 'analytical skills', 'critical thinking']),
  e('Time Management', T.SOFT, ['time management', 'prioritization', 'prioritize', 'deadline', 'deadlines']),
  e('Adaptability', T.SOFT, ['adaptability', 'adaptable', 'fast learner', 'quick learner', 'willingness to learn', 'self-motivated', 'self motivated']),
  e('Ownership', T.SOFT, ['ownership', 'self-starter', 'proactive', 'initiative']),

  // ---- Domain terms & responsibilities
  e('Agile', T.DOMAIN, ['agile', 'scrum', 'kanban', 'sprint', 'sprints'], {}),
  e('Code Review', T.DOMAIN, ['code review', 'code reviews', 'pull request', 'pull requests'], { related: ['Git'] }),
  e('Software Development Life Cycle', T.DOMAIN, ['sdlc', 'software development life cycle', 'software development lifecycle'], {}),
  e('Scalability', T.DOMAIN, ['scalability', 'scalable', 'high availability', 'performance optimization', 'performance optimisation'], { related: ['System Design'] }),
  e('Database Design', T.DOMAIN, ['database design', 'schema design', 'data modeling', 'data modelling', 'normalization'], { related: ['SQL', 'DBMS'] }),
  e('Documentation', T.DOMAIN, ['documentation', 'technical documentation'], {}),
  e('Client Requirements', T.DOMAIN, ['requirements gathering', 'stakeholder', 'stakeholders', 'client requirements', 'requirement analysis'], {}),
  e('E-commerce', T.DOMAIN, ['e-commerce', 'ecommerce'], {}),
  e('Fintech', T.DOMAIN, ['fintech', 'payments', 'payment gateway'], {}),

  // ---- Certifications
  e('AWS Certification', T.CERT, ['aws certified', 'aws cloud practitioner', 'aws solutions architect'], { related: ['AWS'] }),
  e('Azure Certification', T.CERT, ['azure fundamentals', 'az-900', 'azure certified'], { related: ['Azure'] }),
  e('Google Cloud Certification', T.CERT, ['google cloud certified', 'associate cloud engineer'], { related: ['GCP'] }),
  e('Oracle Certification', T.CERT, ['oracle certified', 'oracle certification'], {}),
  e('Scrum Certification', T.CERT, ['certified scrum master', 'csm', 'psm'], { related: ['Agile'] }),
  e('NPTEL', T.CERT, ['nptel'], {}),
  e('Coursera', T.CERT, ['coursera', 'udemy', 'edx'], {}),
];

const TECHNICAL_TYPES = new Set([T.LANG, T.FW, T.DB, T.TOOL, T.CLOUD, T.CONCEPT]);

/** Display category used for the "skills" breakdown. */
const SKILL_CATEGORY = {
  [T.LANG]: 'programmingLanguages',
  [T.FW]: 'frameworks',
  [T.DB]: 'databases',
  [T.TOOL]: 'tools',
  [T.CLOUD]: 'tools',
  [T.CONCEPT]: 'otherSkills',
};

const TYPE_LABEL = {
  [T.LANG]: 'Programming language',
  [T.FW]: 'Framework / library',
  [T.DB]: 'Database',
  [T.TOOL]: 'Tool',
  [T.CLOUD]: 'Cloud / platform',
  [T.CONCEPT]: 'Technical concept',
  [T.SOFT]: 'Soft skill',
  [T.DOMAIN]: 'Domain / responsibility',
  [T.CERT]: 'Certification',
};

const BY_NAME = new Map(ENTRIES.map((x) => [x.name, x]));

/** Strong action verbs — used to judge bullet quality. */
const ACTION_VERBS = new Set(
  (
    'achieved architected authored automated analyzed analysed assisted built collaborated configured constructed contributed created ' +
    'debugged delivered deployed designed developed devised drove enhanced engineered established evaluated executed expanded ' +
    'facilitated fixed generated guided implemented improved increased initiated integrated introduced launched led maintained managed ' +
    'mentored migrated modernized optimized organized orchestrated owned partnered performed pioneered planned prepared presented ' +
    'produced programmed published reduced refactored released researched resolved restructured revamped reviewed scaled secured ' +
    'shipped simplified solved spearheaded streamlined structured supported tested trained transformed troubleshot upgraded utilized ' +
    'won secured ranked earned organised coordinated curated documented handled leveraged applied integrated formulated conducted ' +
    'compiled crafted customized diagnosed drafted engineered extended identified inspected instituted interpreted investigated ' +
    'monitored negotiated operated overhauled prototyped provisioned rebuilt recommended redesigned rewrote validated visualized'
  ).split(/\s+/)
);

module.exports = { ENTRIES, BY_NAME, TECHNICAL_TYPES, SKILL_CATEGORY, TYPE_LABEL, ACTION_VERBS, TYPES: T };
