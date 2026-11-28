package com.habitline.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        LocalProfile::class,
        LocalHabit::class,
        ScheduleRevision::class,
        HabitCompletion::class,
        WidgetBinding::class,
        StorageMigration::class,
        XpEvent::class,
        HabitLink::class,
        LocalGoal::class,
        GoalHabit::class,
        Milestone::class,
        PersonalChallenge::class,
        ChallengeHabit::class,
        ProfilePreference::class,
        SocialCacheEntry::class,
        PendingMutation::class,
        Deletion::class,
        SyncCursor::class
    ],
    version = 1,
    exportSchema = true
)
abstract class TrackerDatabase : RoomDatabase() {
    abstract fun tracker(): TrackerDao
    abstract fun progress(): ProgressDao

    companion object {
        @Volatile private var instance: TrackerDatabase? = null

        fun open(context: Context): TrackerDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext, TrackerDatabase::class.java, "habitline.db"
            ).build().also { instance = it }
        }
    }
}
