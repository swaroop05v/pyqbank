// Demo data for PYQ Bank.
//
// Each topic has one or more question FAMILIES. A family is one exam question written
// several different ways (the "variants"), the way a question gets reworded from year
// to year. seed.mjs builds 5 years of papers by sampling families and variants, so the
// database ends up with genuine repeats (same family, different wording) and
// near-misses (same topic, different question) for the detector to tell apart.
//
// Each unit also has a few one-off questions (`fresh`: [topic index, marks, text]) that are
// asked only once, so not everything in the bank is a repeat.
//
// The course codes, papers and people are illustrative demo data.

export const users = {
  admin: { email: 'admin@pyqbank.test', name: 'Exam Cell Admin', password: 'Admin@123' },
  faculty: [
    { email: 'faculty@pyqbank.test', name: 'Dr. Meera Iyer', password: 'Faculty@123', courses: ['UE23CS351A'] },
    { email: 'os.faculty@pyqbank.test', name: 'Prof. Arjun Rao', password: 'Faculty@123', courses: ['UE23CS242B'] },
  ],
  students: [
    ['student@pyqbank.test', 'Ananya Sharma', 'PES1UG23CS101', 5],
    ['rahul.k@pyqbank.test', 'Rahul Krishnan', 'PES1UG23CS114', 5],
    ['divya.n@pyqbank.test', 'Divya Nair', 'PES1UG23CS127', 5],
    ['farhan.a@pyqbank.test', 'Farhan Ahmed', 'PES1UG23CS139', 5],
    ['sneha.p@pyqbank.test', 'Sneha Patil', 'PES1UG23CS152', 5],
    ['karthik.s@pyqbank.test', 'Karthik Subramanian', 'PES1UG24CS208', 3],
    ['meghana.r@pyqbank.test', 'Meghana Reddy', 'PES1UG24CS215', 3],
    ['vikram.j@pyqbank.test', 'Vikram Joshi', 'PES2UG23CS301', 5],
  ],
  studentPassword: 'Student@123',
};

// f(marks, ...variants) builds a family
const f = (marks, ...variants) => ({ marks, variants });

export const courses = [
  {
    code: 'UE23CS351A', name: 'Database Management Systems', semester: 5, credits: 4,
    units: [
      {
        title: 'Introduction to Database Management and SQL',
        fresh: [
          [0, 4, "List four disadvantages of storing an organisation's data in flat files instead of a DBMS."],
          [1, 6, "Model a hospital system where doctors treat patients and patients are admitted to wards. Draw the ER diagram."],
          [3, 4, "Explain the rename and Cartesian product operations of relational algebra."],
          [4, 4, "What is a NULL value? How do comparisons with NULL behave in SQL?"],
          [1, 5, "Explain generalisation and specialisation in the extended ER model with an example."],
        ],
        topics: [
          { name: 'Database architecture and data independence', families: [
            f(6, 'Explain the three-schema architecture of a DBMS with a neat diagram.',
                 'With a diagram, describe the three levels of abstraction (physical, logical and view level) in a database system.',
                 'Describe the ANSI/SPARC three-level architecture of a database system with a neat sketch.'),
            f(4, 'Differentiate between logical and physical data independence with examples.',
                 'What is data independence? Distinguish logical data independence from physical data independence.'),
          ] },
          { name: 'E-R model', families: [
            f(8, 'Draw an ER diagram for a university database with students, courses, instructors and enrolments. Clearly mark keys and cardinalities.',
                 'Design an ER diagram for a college that records students, the courses they register for and the instructors who teach them. Show primary keys and mapping cardinalities.',
                 'Construct an E-R diagram for a university where students enrol in courses taught by instructors. Indicate key attributes and cardinality constraints.'),
            f(4, 'What is a weak entity set? Explain with an example how it is represented in an ER diagram.',
                 'Explain weak entity sets and identifying relationships with a suitable example.'),
          ] },
          { name: 'Reducing an ER diagram to a relational schema', families: [
            f(6, 'Explain the steps to convert an ER diagram into relational tables, covering strong entities, weak entities and many-to-many relationships.',
                 'How is an E-R diagram reduced to a relational schema? Explain the mapping of strong entity sets, weak entity sets and many-to-many relationship sets to tables.'),
          ] },
          { name: 'Relational algebra', families: [
            f(6, 'Explain the select, project and join operations of relational algebra with examples.',
                 'With examples, describe the selection, projection and natural join operators of relational algebra.'),
            f(6, "Write relational algebra expressions to find (i) the names of employees who work in the 'Sales' department and (ii) the departments that have no employees.",
                 "For the relations Employee(eid, name, dept) and Department(dept, location), write relational algebra queries to list employees of the 'Sales' department and departments without any employees."),
          ] },
          { name: 'Keys and integrity constraints', families: [
            f(4, 'Differentiate between super key, candidate key and primary key with examples.',
                 'Explain super key, candidate key, primary key and foreign key with a suitable example.'),
            f(4, 'What is referential integrity? Explain the ON DELETE CASCADE and ON DELETE SET NULL options of a foreign key.',
                 'Explain referential integrity constraints and the CASCADE, SET NULL and RESTRICT actions taken when a referenced row is deleted.'),
          ] },
        ],
      },
      {
        title: 'Advanced SQL in Database Design',
        fresh: [
          [0, 4, "Write an SQL query using EXISTS to list departments that have at least one project."],
          [1, 4, "Write a query that uses a self join to list each employee along with the name of their manager."],
          [2, 4, "What is a materialised view? How is it different from an ordinary view?"],
          [5, 5, "Write a query using the LAG window function to show each month's sales and the change from the previous month."],
          [0, 5, "Explain the set operations UNION, INTERSECT and EXCEPT in SQL with examples."],
          [4, 4, "Write a stored procedure that transfers a student from one section to another, rejecting the transfer if the target section is full."],
        ],
        topics: [
          { name: 'Nested and correlated subqueries', families: [
            f(6, 'Differentiate between a nested subquery and a correlated subquery with an example query for each.',
                 'What is a correlated subquery? How does it differ from an ordinary nested subquery? Illustrate with SQL.'),
            f(4, 'Write an SQL query to find the employees who earn more than the average salary of their own department.',
                 'Using a correlated subquery, list the employees whose salary is greater than the average salary in their department.'),
          ] },
          { name: 'Join expressions', families: [
            f(6, 'Explain inner join, left outer join, right outer join and full outer join with examples.',
                 'With suitable tables and output, explain the different types of SQL joins: inner, left outer, right outer and full outer join.'),
            f(4, 'Explain natural join and the USING clause. When can a natural join give unexpected results?'),
          ] },
          { name: 'Views', families: [
            f(5, 'What is a view? Explain the advantages of views and the conditions under which a view is updatable.',
                 'Define a view in SQL. Discuss when a view can be updated and list the benefits of using views.'),
          ] },
          { name: 'Triggers', families: [
            f(6, "What is a trigger? Write a trigger that logs every update of an employee's salary into an audit table.",
                 "Explain triggers in SQL. Write a trigger that records the old and new salary in a log table whenever an employee's salary changes.",
                 'Write an SQL trigger that keeps a history of salary changes of employees in a separate table.'),
            f(4, 'Differentiate between row-level and statement-level triggers with examples.',
                 'Explain BEFORE and AFTER triggers and the difference between FOR EACH ROW and FOR EACH STATEMENT triggers.'),
          ] },
          { name: 'Functions and procedures', families: [
            f(6, 'Differentiate between stored procedures and functions in SQL. Write a function that returns the number of courses taken by a student.',
                 'Compare SQL functions and stored procedures. Write a function to count the courses a given student has registered for.'),
          ] },
          { name: 'Window functions and CTEs', families: [
            f(5, 'Explain window functions with an example that uses RANK() and PARTITION BY.',
                 'What are window functions? Write a query using RANK() OVER (PARTITION BY ...) to rank employees by salary within each department.'),
            f(5, 'What is a Common Table Expression (CTE)? Write a recursive CTE to find all subordinates of a manager.',
                 'Explain recursive WITH queries and write one that lists every employee reporting directly or indirectly to a given manager.'),
          ] },
        ],
      },
      {
        title: 'Design Concepts and Implementation',
        fresh: [
          [0, 4, "Find a minimal (canonical) cover for F = {A\u2192BC, B\u2192C, A\u2192B, AB\u2192C}."],
          [1, 6, "Normalise the relation Order(order_id, customer, customer_city, item, qty, price) up to 3NF."],
          [2, 5, "Explain fourth normal form and multivalued dependencies with an example."],
          [3, 5, "Explain how the cost of a query plan is estimated using the number of block transfers and seeks."],
          [3, 4, "Compare nested-loop join and hash join algorithms."],
        ],
        topics: [
          { name: 'Functional dependencies', families: [
            f(6, "Define functional dependency. State Armstrong's axioms and derive the union and decomposition rules.",
                 "State Armstrong's inference rules. Using them, prove the union rule and the decomposition rule for functional dependencies."),
            f(6, 'Given R(A,B,C,D,E) with F = {A→B, BC→D, D→E}, compute the closure of {A,C} and find all candidate keys of R.',
                 'For the relation R(A,B,C,D,E) and the FDs A→B, BC→D, D→E, find the attribute closure (AC)+ and determine the candidate keys of R.'),
          ] },
          { name: 'Normal forms (1NF to 3NF)', families: [
            f(8, 'Explain 1NF, 2NF and 3NF with suitable examples.',
                 'With examples, describe the first, second and third normal forms and the anomalies each one removes.',
                 'What is normalisation? Explain 1NF, 2NF and 3NF using an example table that is decomposed step by step.'),
            f(4, 'What are insertion, deletion and update anomalies? Illustrate them with an unnormalised table.'),
          ] },
          { name: 'BCNF and decomposition', families: [
            f(6, 'Explain BCNF. How is it different from 3NF? Give an example of a relation that is in 3NF but not in BCNF.',
                 'Distinguish between 3NF and Boyce-Codd normal form, and give a relation that satisfies 3NF but violates BCNF.'),
            f(5, 'What is a lossless-join decomposition? How do you test whether a decomposition is lossless?',
                 'Explain the lossless-join and dependency-preservation properties of a decomposition.'),
          ] },
          { name: 'Query processing and optimisation', families: [
            f(6, 'Explain the steps involved in query processing with a neat diagram.',
                 'Describe the stages of query processing: parsing and translation, optimisation and evaluation.'),
            f(6, 'What is query optimisation? Explain heuristic optimisation of a query tree with an example.',
                 'Explain how heuristic rules such as pushing selections down are used to optimise a relational algebra query tree.'),
          ] },
        ],
      },
      {
        title: 'Next-Gen Data Management',
        fresh: [
          [0, 4, "Explain the difference between a recoverable and a cascadeless schedule."],
          [1, 5, "Explain multiple-granularity locking and intention lock modes."],
          [2, 5, "Explain the document data model of MongoDB and write an aggregation pipeline that counts orders per customer."],
          [4, 4, "Compare Euclidean distance, dot product and cosine similarity as metrics for comparing embeddings."],
          [1, 4, "Explain the timestamp-ordering protocol for concurrency control."],
        ],
        topics: [
          { name: 'Transactions and ACID properties', families: [
            f(6, 'Explain the ACID properties of a transaction with the example of a bank transfer.',
                 'What are the ACID properties? Illustrate each one with a funds-transfer transaction.',
                 'Define a transaction and explain atomicity, consistency, isolation and durability using a money transfer between two accounts.'),
            f(4, 'Draw and explain the state transition diagram of a transaction.',
                 'With a neat diagram, explain the different states a transaction passes through from start to commit or abort.'),
          ] },
          { name: 'Concurrency control and locking', families: [
            f(6, 'Explain the two-phase locking protocol. Does it guarantee serializability?',
                 'Describe the two-phase locking (2PL) protocol and explain why it ensures conflict serializability.'),
            f(6, 'What is a deadlock? Explain the wait-die and wound-wait schemes for deadlock prevention.',
                 'Explain deadlock prevention using the wait-die and wound-wait timestamp schemes.'),
            f(6, 'Explain conflict serializability. Test whether a given schedule is conflict serializable using a precedence graph.'),
          ] },
          { name: 'NoSQL databases', families: [
            f(6, 'Compare relational databases with NoSQL databases. When would you choose a document store?',
                 'Differentiate between SQL and NoSQL databases and explain situations where a NoSQL document database is preferred.'),
            f(5, 'Explain the CAP theorem and its implications for distributed NoSQL systems.',
                 'State the CAP theorem. Which two properties do typical NoSQL stores choose, and why?'),
            f(4, 'Explain key-value databases with an example such as Redis. List their advantages and limitations.'),
          ] },
          { name: 'Graph databases (Neo4j)', families: [
            f(6, 'Explain the property graph model used by Neo4j. Write a Cypher query to find the friends of friends of a user.',
                 'Describe how Neo4j stores data as nodes and relationships, and write a Cypher query that returns friends-of-friends of a person.'),
          ] },
          { name: 'Vector databases and similarity search', families: [
            f(6, 'What is a vector database? Explain how embeddings and cosine similarity are used for semantic search.',
                 'Explain vector embeddings and similarity search. How does a vector database find documents with a similar meaning?',
                 'How are text embeddings stored and searched in a vector database? Explain the role of the similarity metric.'),
            f(5, 'Explain approximate nearest-neighbour indexes such as HNSW and why vector databases use them.'),
          ] },
        ],
      },
    ],
  },
  {
    code: 'UE23CS242B', name: 'Operating Systems', semester: 4, credits: 4,
    units: [
      {
        title: 'Processes and CPU Scheduling',
        fresh: [
          [0, 4, "Explain the fork() and exec() system calls with an example program."],
          [1, 5, "Explain multilevel feedback queue scheduling."],
          [2, 4, "What are pipes? Differentiate ordinary pipes from named pipes."],
          [1, 4, "What is the convoy effect? Which scheduling algorithm suffers from it?"],
        ],
        topics: [
          { name: 'Process concept and PCB', families: [
            f(5, 'Draw the process state diagram and explain each state transition.',
                 'With a neat diagram, explain the various states of a process and the transitions between them.'),
            f(4, 'What is a process control block? List the information stored in a PCB.',
                 'Explain the contents of a process control block and why the OS needs it during a context switch.'),
          ] },
          { name: 'CPU scheduling algorithms', families: [
            f(8, 'For the given set of processes with arrival and burst times, draw Gantt charts for FCFS, SJF and Round Robin (quantum 2) and compute the average waiting time.',
                 'Consider five processes with given arrival and burst times. Draw the Gantt charts for FCFS, non-preemptive SJF and Round Robin with time quantum 2, and find the average waiting and turnaround times.'),
            f(4, 'Differentiate between preemptive and non-preemptive scheduling with examples.',
                 'Explain the difference between preemptive and non-preemptive CPU scheduling.'),
          ] },
          { name: 'Inter-process communication', families: [
            f(5, 'Compare the shared memory and message passing models of inter-process communication.',
                 'Explain the two fundamental models of IPC, shared memory and message passing, with their advantages.'),
          ] },
        ],
      },
      {
        title: 'Synchronization and Deadlocks',
        fresh: [
          [0, 4, "Explain how the test_and_set instruction can be used to implement a spinlock."],
          [1, 6, "Give a solution to the readers-writers problem that does not starve writers."],
          [2, 5, "Explain deadlock detection using a wait-for graph."],
          [0, 4, "What is a monitor? How does it differ from a semaphore?"],
        ],
        topics: [
          { name: 'Critical section and semaphores', families: [
            f(6, "What is the critical section problem? State the three requirements of a solution and explain Peterson's solution.",
                 "Explain the critical-section problem and the conditions any solution must satisfy. Describe Peterson's algorithm."),
            f(5, 'What is a semaphore? Explain the wait() and signal() operations and how semaphores enforce mutual exclusion.',
                 'Define counting and binary semaphores and show how wait and signal operations achieve mutual exclusion.'),
          ] },
          { name: 'Classical synchronization problems', families: [
            f(6, 'Explain the bounded-buffer producer-consumer problem and give a solution using semaphores.',
                 'Write a semaphore-based solution to the producer-consumer problem with a bounded buffer.'),
            f(6, "Explain the dining philosophers problem and a deadlock-free solution."),
          ] },
          { name: 'Deadlocks', families: [
            f(6, "Explain the Banker's algorithm for deadlock avoidance. Determine whether the given system is in a safe state.",
                 "Using the Banker's algorithm, check if the system with the given allocation and maximum matrices is in a safe state and find a safe sequence."),
            f(4, 'State the four necessary conditions for a deadlock to occur.',
                 'What are the necessary conditions for deadlock? Explain each one briefly.'),
          ] },
        ],
      },
      {
        title: 'Memory Management',
        fresh: [
          [0, 5, "Explain the internal and external fragmentation and how compaction helps."],
          [1, 4, "Explain Belady's anomaly with an example reference string."],
          [0, 5, "Explain hierarchical (multi-level) page tables and why they are needed for large address spaces."],
          [2, 4, "Explain the page-fault frequency approach to controlling thrashing."],
        ],
        topics: [
          { name: 'Paging and segmentation', families: [
            f(6, 'Explain paging with a neat diagram. How is a logical address translated to a physical address?',
                 'Describe the paging hardware and the translation of a logical address into a physical address using a page table.'),
            f(4, 'What is a TLB? Compute the effective memory access time given the TLB hit ratio.'),
          ] },
          { name: 'Virtual memory and page replacement', families: [
            f(8, 'For the given reference string and 3 frames, find the number of page faults using FIFO, LRU and Optimal page replacement.',
                 'Calculate the page faults for FIFO, LRU and Optimal replacement algorithms for the given page reference string with three frames.'),
            f(5, 'Explain demand paging and the steps taken by the OS to handle a page fault.',
                 'What happens when a page fault occurs? Explain the steps in handling a page fault under demand paging.'),
          ] },
          { name: 'Thrashing', families: [
            f(4, 'What is thrashing? How does the working-set model help prevent it?',
                 'Explain the cause of thrashing and describe how the working-set model controls it.'),
          ] },
        ],
      },
      {
        title: 'Storage Management and File Systems',
        fresh: [
          [0, 4, "Explain the structure of a magnetic disk and define seek time and rotational latency."],
          [1, 5, "Explain how free space is managed using a bit vector and a linked list."],
          [2, 4, "What are hard links and symbolic links? How do they differ?"],
          [0, 5, "Explain RAID levels 0, 1 and 5."],
        ],
        topics: [
          { name: 'Disk scheduling', families: [
            f(8, 'Given the disk request queue and initial head position, calculate the total head movement for FCFS, SSTF, SCAN and C-SCAN.',
                 'For the given queue of cylinder requests, compute the total seek distance using FCFS, SSTF, SCAN and C-SCAN disk scheduling.'),
          ] },
          { name: 'File allocation methods', families: [
            f(6, 'Explain contiguous, linked and indexed file allocation methods with their advantages and disadvantages.',
                 'Compare the contiguous, linked and indexed allocation methods for files on disk.'),
          ] },
          { name: 'Directory structure', families: [
            f(5, 'Explain single-level, two-level and tree-structured directory organisations.',
                 'Describe the different directory structures used by file systems, with diagrams.'),
          ] },
        ],
      },
    ],
  },
];

export const years = [2021, 2022, 2023, 2024, 2025];

// Questions a faculty member can paste during the live demo (DBMS ISA1 2026):
// the first two are rewordings of frequent questions, the last one is new.
export const demoNewQuestions = [
  ['1a', 'Explain the three-schema architecture of a DBMS with a diagram'],
  ['1b', 'Explain the correlated subquery with an example and compare it with a nested subquery.'],
  ['2a', 'Explain the GROUPING SETS and ROLLUP extensions of GROUP BY with an example.'],
];
