// @ts-nocheck
import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserRole } from '../entities/enums';
import { AppDataSource } from '../config/data-source';
import { Survey, SurveyQuestion, SurveyResponse } from '../entities/Survey';
import { userNames } from '../utils/lookups';
import { today } from '../utils/helpers';

const router = Router();

router.use(authenticate);

const MANAGE: UserRole[] = [UserRole.ADMIN, UserRole.PRINCIPAL, UserRole.DIRECTOR];

// ---------------- Surveys (admin) ----------------

router.get('/', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query as any;
    const repo = AppDataSource.getRepository(Survey);
    const qb = repo.createQueryBuilder('s').orderBy('s.createdAt', 'DESC');
    if (status) qb.andWhere('s.status = :status', { status });
    const surveys = await qb.getMany();
    const questions = await AppDataSource.getRepository(SurveyQuestion).find({ order: { order: 'ASC' } });
    const responses = await AppDataSource.getRepository(SurveyResponse).find();
    const counts = new Map<string, number>();
    for (const r of responses) counts.set(r.surveyId, (counts.get(r.surveyId) || 0) + 1);
    res.json(
      surveys.map((s) => ({
        ...s,
        questions: questions.filter((q) => q.surveyId === s.id),
        responseCount: counts.get(s.id) || 0,
      })),
    );
  } catch (e) {
    console.error('[surveys:list]', e);
    res.status(500).json({ message: 'Could not load surveys.' });
  }
});

router.post('/', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.title) return res.status(400).json({ message: 'title is required.' });
    const repo = AppDataSource.getRepository(Survey);
    const survey = await repo.save(
      repo.create({
        title: b.title,
        description: b.description || undefined,
        audience: b.audience || 'all',
        status: b.status || 'draft',
        closesAt: b.closesAt || undefined,
        createdById: req.user!.userId,
      }),
    );
    const qRepo = AppDataSource.getRepository(SurveyQuestion);
    const questions = [];
    if (Array.isArray(b.questions)) {
      for (let i = 0; i < b.questions.length; i++) {
        const q = b.questions[i];
        if (!q.text) continue;
        questions.push(
          await qRepo.save(
            qRepo.create({
              surveyId: survey.id,
              order: i,
              text: q.text,
              type: q.type || 'rating',
              options: q.options || undefined,
              minRating: Number(q.minRating) || 1,
              maxRating: Number(q.maxRating) || 5,
              required: q.required !== false,
            }),
          ),
        );
      }
    }
    res.status(201).json({ ...survey, questions });
  } catch (e) {
    console.error('[surveys:create]', e);
    res.status(500).json({ message: 'Could not create survey.' });
  }
});

router.patch('/:id', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Survey);
    const row = await repo.findOne({ where: { id: String(req.params.id) } });
    if (!row) return res.status(404).json({ message: 'Survey not found.' });
    const b = req.body ?? {};
    for (const k of ['title', 'description', 'audience', 'status', 'closesAt']) {
      if (b[k] !== undefined) (row as any)[k] = b[k];
    }
    await repo.save(row);
    res.json(row);
  } catch (e) {
    res.status(500).json({ message: 'Could not update survey.' });
  }
});

/** Aggregated results for a survey. */
router.get('/:id/results', authorize(...MANAGE), async (req: AuthRequest, res: Response) => {
  try {
    const surveyId = String(req.params.id);
    const [questions, responses] = await Promise.all([
      AppDataSource.getRepository(SurveyQuestion).find({ where: { surveyId }, order: { order: 'ASC' } as any }),
      AppDataSource.getRepository(SurveyResponse).find({ where: { surveyId } }),
    ]);
    const names = await userNames(responses.map((r) => r.userId));
    const perQuestion = questions.map((q) => {
      const answers = responses
        .map((r) => (r.answers || []).find((a: any) => a.questionId === q.id)?.answer)
        .filter((a) => a !== undefined && a !== null && a !== '');
      if (q.type === 'rating' || q.type === 'single_choice') {
        const buckets = new Map<string, number>();
        let sum = 0;
        for (const a of answers) {
          const key = String(a);
          buckets.set(key, (buckets.get(key) || 0) + 1);
          const n = Number(a);
          if (!isNaN(n)) sum += n;
        }
        return {
          question: q,
          count: answers.length,
          average: answers.length && sum ? Math.round((sum / answers.length) * 100) / 100 : null,
          distribution: [...buckets.entries()].map(([value, count]) => ({ value, count })),
        };
      }
      // text / multi_choice — return raw answers
      return { question: q, count: answers.length, answers: answers.slice(0, 200) };
    });
    res.json({
      surveyId,
      totalResponses: responses.length,
      questions: perQuestion,
      respondents: responses.map((r) => ({ userId: r.userId, name: names.get(r.userId), submittedAt: r.createdAt })),
    });
  } catch (e) {
    console.error('[surveys:results]', e);
    res.status(500).json({ message: 'Could not load results.' });
  }
});

// ---------------- Respondent side ----------------

/** Published surveys visible to the caller, with their response state. */
router.get('/available', async (req: AuthRequest, res: Response) => {
  try {
    const audience = req.user!.role === UserRole.PARENT ? 'parent' : req.user!.role === UserRole.TEACHER || req.user!.role === UserRole.ADMIN ? 'staff' : req.user!.role;
    const surveys = await AppDataSource.getRepository(Survey).find();
    const questions = await AppDataSource.getRepository(SurveyQuestion).find({ order: { order: 'ASC' } });
    const mine = await AppDataSource.getRepository(SurveyResponse).find({ where: { userId: req.user!.userId } });
    const mineMap = new Map(mine.map((r) => [r.surveyId, r]));
    const visible = surveys.filter((s) => {
      if (s.status !== 'published') return false;
      if (s.closesAt && s.closesAt < today()) return false;
      if (s.audience === 'all') return true;
      if (s.audience === audience) return true;
      if (s.audience === 'staff' && ['admin', 'principal', 'director', 'accountant', 'teacher'].includes(req.user!.role)) return true;
      if (s.audience === 'parent' && req.user!.role === UserRole.PARENT) return true;
      return false;
    });
    res.json(
      visible.map((s) => ({
        ...s,
        questions: questions.filter((q) => q.surveyId === s.id),
        myResponse: mineMap.get(s.id) || null,
      })),
    );
  } catch (e) {
    res.status(500).json({ message: 'Could not load surveys.' });
  }
});

/** Submit a response (one per user per survey). */
router.post('/:id/respond', async (req: AuthRequest, res: Response) => {
  try {
    const surveyId = String(req.params.id);
    const { answers } = req.body ?? {};
    if (!Array.isArray(answers)) return res.status(400).json({ message: 'answers array is required.' });
    const survey = await AppDataSource.getRepository(Survey).findOne({ where: { id: surveyId } });
    if (!survey || survey.status !== 'published') return res.status(404).json({ message: 'Survey not available.' });
    if (survey.closesAt && survey.closesAt < today()) return res.status(400).json({ message: 'Survey has closed.' });

    const questions = await AppDataSource.getRepository(SurveyQuestion).find({ where: { surveyId } });
    for (const q of questions) {
      if (!q.required) continue;
      const ans = answers.find((a: any) => a.questionId === q.id);
      const empty = ans === undefined || ans.answer === undefined || ans.answer === null || ans.answer === '' || (Array.isArray(ans.answer) && !ans.answer.length);
      if (empty) return res.status(400).json({ message: `Missing answer for: ${q.text}` });
    }

    const repo = AppDataSource.getRepository(SurveyResponse);
    let row = await repo.findOne({ where: { surveyId, userId: req.user!.userId } });
    if (!row) row = repo.create({ surveyId, userId: req.user!.userId });
    row.answers = answers;
    await repo.save(row);
    res.json(row);
  } catch (e) {
    console.error('[surveys:respond]', e);
    res.status(500).json({ message: 'Could not submit response.' });
  }
});

export default router;
