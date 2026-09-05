import { Router } from 'express';
import { contactsController } from '../controllers/contacts.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAuth);

router.get('/contacts', contactsController.list);

router.get('/suppressions', contactsController.listSuppressed);
router.post('/suppressions', contactsController.addSuppression);
router.delete('/suppressions/:email', contactsController.removeSuppression);

router.get('/contact-lists', contactsController.listGroups);
router.post('/contact-lists', contactsController.createGroup);
router.put('/contact-lists/:listId', contactsController.updateGroup);
router.delete('/contact-lists/:listId', contactsController.removeGroup);
router.post('/contact-lists/membership', contactsController.updateMembership);

export default router;